import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ethers, Contract, JsonRpcProvider } from 'ethers';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateLimitedProvider } from './rate-limited-provider';

import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import {
  SignalDirection,
  SignalStatus,
  TokenPrediction,
} from '../../models/Signal/Signal.types';
import { ABI } from './abi';
import { UserStateOnTheSystemEnum } from '../../models/User/User.types';

interface BlockchainSignal {
  fid: bigint;
  tokens: TokenPrediction[];
  createdAt: bigint;
  expiresAt: bigint;
  status: number;
  correctPredictions: number;
}

interface BlockchainAccount {
  fid: bigint;
  createdAt: bigint;
  isBanned: boolean;
  isSubscriber: boolean;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly provider: RateLimitedProvider;
  private contract: Contract;
  private readonly signer?: ethers.Wallet;

  // Event processing queue
  private eventQueue: Array<{ type: string; data: any; timestamp: number }> = [];
  private isProcessingEvents = false;

  // Contract address on Base mainnet - ProjectLighthouseV12
  private readonly CONTRACT_ADDRESS =
    '0xE6EA0276F2efEAe42dE1DeE0A6C4a4bE3cC85bEB';
  private readonly BASE_RPC_URL = process.env.BASE_RPC_URL;
  private readonly PRIVATE_KEY = process.env.PRIVATE_KEY;

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    // Initialize rate-limited provider with retry configuration
    this.provider = new RateLimitedProvider(this.BASE_RPC_URL, undefined, {
      staticNetwork: true,
      polling: true,
      pollingInterval: 4000,
      minDelay: 150, // 150ms between requests
      maxConcurrent: 2, // Max 2 concurrent requests
      maxRetries: 3, // Retry up to 3 times on rate limits
    });

    // Initialize contract
    this.contract = new Contract(this.CONTRACT_ADDRESS, ABI, this.provider);

    // Initialize signer if private key is provided (for settlement operations)
    if (this.PRIVATE_KEY) {
      this.signer = new ethers.Wallet(this.PRIVATE_KEY, this.provider);
      this.contract = this.contract.connect(this.signer) as Contract;
      this.logger.log(
        'Blockchain service initialized with signer for settlement operations',
      );
    } else {
      this.logger.warn(
        'No private key provided - settlement operations will be disabled',
      );
    }

    this.logger.log(
      `Contract initialized at ${this.CONTRACT_ADDRESS} on Base network`,
    );
  }

  /**
   * Initialize the blockchain service and start real-time event listening
   */
  async onModuleInit(): Promise<void> {
    this.logger.log(
      '🚀 BLOCKCHAIN SERVICE: Initializing blockchain service...',
    );

    try {
      this.logger.log(
        `🔗 BLOCKCHAIN SERVICE: Connected to contract ${this.CONTRACT_ADDRESS} on Base network`,
      );
      this.logger.log(
        `💰 BLOCKCHAIN SERVICE: Signer available: ${!!this.signer} (settlement operations ${this.signer ? 'enabled' : 'disabled'})`,
      );

      // Start real-time event listening only
      await this.startEventListening();

      this.logger.log(
        '✅ BLOCKCHAIN SERVICE: Blockchain service fully initialized and operational',
      );
    } catch (error) {
      this.logger.error(
        '❌ BLOCKCHAIN SERVICE: Error initializing blockchain service:',
        error,
      );
    }
  }

  /**
   * Convert blockchain direction enum to our internal type
   */
  private mapDirection(direction: number): SignalDirection {
    return direction === 0 ? 'UP' : 'DOWN';
  }

  /**
   * Convert blockchain status enum to our internal type
   */
  private mapStatus(status: number): SignalStatus {
    switch (status) {
      case 0:
        return 'ACTIVE';
      case 1:
        return 'WON';
      case 2:
        return 'LOST';
      case 3:
        return 'EXPIRED';
      default:
        return 'ACTIVE';
    }
  }

  /**
   * Convert our internal direction to blockchain enum
   */
  private mapDirectionToEnum(direction: SignalDirection): number {
    return direction === 'UP' ? 0 : 1;
  }

  /**
   * Queue an event for sequential processing
   */
  private async queueEvent(type: string, data: any): Promise<void> {
    const event = {
      type,
      data,
      timestamp: Date.now(),
    };
    
    this.eventQueue.push(event);
    this.logger.log(`Queued ${type} event - Queue length: ${this.eventQueue.length}`);
    
    // Start processing if not already running
    if (!this.isProcessingEvents) {
      this.processEventQueue();
    }
  }

  /**
   * Process events sequentially from the queue
   */
  private async processEventQueue(): Promise<void> {
    if (this.isProcessingEvents || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessingEvents = true;
    this.logger.log(`Starting event queue processing - ${this.eventQueue.length} events queued`);

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (!event) break;

      try {
        await this.processQueuedEvent(event);
        // Add delay between event processing to prevent overwhelming the system
        await this.delay(300);
      } catch (error) {
        this.logger.error(`Error processing queued ${event.type} event:`, error);
      }
    }

    this.isProcessingEvents = false;
    this.logger.log('Event queue processing completed');
  }

  /**
   * Process a single queued event
   */
  private async processQueuedEvent(event: { type: string; data: any; timestamp: number }): Promise<void> {
    const { type, data } = event;

    switch (type) {
      case 'AccountCreated':
        await this.syncUserAccountFromBlockchain(data.user, data.fid);
        break;
      
      case 'Subscribed':
        const dbUser = await this.userRepository.findOne({
          where: { fid: data.fid },
        });
        if (dbUser) {
          dbUser.isSubscriber = true;
          dbUser.subscriptionExpiresAt = data.expiresAt;
          dbUser.subscribedAt = new Date();
          await this.userRepository.save(dbUser);
          this.logger.log(`✅ QUEUED: User FID ${data.fid} subscription updated`);
        }
        break;
      
      case 'SignalCreated':
        const syncedSignal = await this.syncSignalFromBlockchain(data.signalId);
        if (syncedSignal) {
          this.logger.log(`✅ QUEUED: Successfully synced Signal ${data.signalId}`);
          await this.updateUserStats(data.fid);
        }
        break;
      
      case 'SignalSettled':
        const existingSignal = await this.signalRepository.findOne({
          where: { signalId: data.signalId.toString() },
        });
        if (existingSignal) {
          existingSignal.correctPredictions = data.correctPredictions;
          existingSignal.status = this.mapStatus(data.status);
          await this.signalRepository.save(existingSignal);
          this.logger.log(`✅ QUEUED: Updated Signal ${data.signalId}`);
          await this.updateUserStats(data.fid);
        }
        break;
      
      default:
        this.logger.warn(`Unknown event type in queue: ${type}`);
    }
  }

  /**
   * Get signal data from blockchain by signal ID
   */
  async getSignalFromBlockchain(
    signalId: number,
  ): Promise<BlockchainSignal | null> {
    try {
      const signal = await this.executeWithRetry(() =>
        this.contract.getSignal(signalId),
      );
      return signal;
    } catch (error) {
      this.logger.error(
        `Error fetching signal ${signalId} from blockchain:`,
        error,
      );
      return null;
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        if (this.isRetryableError(error) && attempt < maxRetries) {
          // Enhanced exponential backoff with jitter
          const baseDelay = delayMs * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 500; // Add up to 500ms jitter
          const finalDelay = baseDelay + jitter;
          
          this.logger.warn(
            `Blockchain operation failed (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(finalDelay)}ms: ${error.message}`,
          );
          
          await this.delay(finalDelay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    const retryableMessages = [
      'filter not found',
      'no backend is currently healthy',
      'connection timeout',
      'network error',
      'rate limit',
      'too many requests',
      'internal error',
      'exceeded its compute units per second capacity',
      'compute units per second capacity',
      'rate limited',
      'throttled',
      '429',
    ];

    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.code?.toString() || '';
    const errorBody = error?.body?.toLowerCase() || '';

    return (
      retryableMessages.some((msg) => 
        errorMessage.includes(msg) || errorBody.includes(msg)
      ) ||
      errorCode === '429' ||
      error?.error?.code === 429 ||
      error?.status === 429
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get account data from blockchain
   */
  async getAccountFromBlockchain(
    walletAddress: string,
  ): Promise<BlockchainAccount | null> {
    try {
      const account = await this.contract.getAccount(walletAddress);
      return account;
    } catch (error) {
      this.logger.error(
        `Error fetching account ${walletAddress} from blockchain:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get user signals from blockchain
   */
  async getUserSignalsFromBlockchain(fid: number): Promise<number[]> {
    try {
      const signalIds = await this.contract.getUserSignals(fid);
      return signalIds.map((id: bigint) => Number(id));
    } catch (error) {
      this.logger.error(`Error fetching user signals for FID ${fid}:`, error);
      return [];
    }
  }

  /**
   * Get contract stats from blockchain
   */
  async getContractStatsFromBlockchain(): Promise<{
    totalSignals: number;
    totalAccounts: number;
    deploymentTimestamp: number;
    usdcBalance: number;
    jbmBalance: number;
  } | null> {
    try {
      const stats = await this.contract.getContractStats();
      return {
        totalSignals: Number(stats._totalSignals),
        totalAccounts: Number(stats._totalAccounts),
        deploymentTimestamp: Number(stats._deploymentTimestamp),
        usdcBalance: Number(stats._usdcBalance),
        jbmBalance: Number(stats._jbmBalance),
      };
    } catch (error) {
      this.logger.error('Error fetching contract stats:', error);
      return null;
    }
  }

  /**
   * Sync a specific signal from blockchain to database
   */
  async syncSignalFromBlockchain(signalId: number): Promise<Signal | null> {
    try {
      const blockchainSignal = await this.getSignalFromBlockchain(signalId);
      if (!blockchainSignal) {
        return null;
      }

      // Check if signal already exists in database
      let existingSignal = await this.signalRepository.findOne({
        where: { signalId: signalId.toString() },
        relations: ['user'],
      });

      // Get or create user
      let user = await this.userRepository.findOne({
        where: { fid: Number(blockchainSignal.fid) },
      });

      if (!user) {
        // Create user if doesn't exist
        user = this.userRepository.create({
          fid: Number(blockchainSignal.fid),
          username: `user_${blockchainSignal.fid}`,
          stateOnTheSystem: UserStateOnTheSystemEnum.WITH_ACCOUNT,
        });
        await this.userRepository.save(user);
      }

      const signalData = {
        signalId: signalId.toString(),
        tokens: blockchainSignal.tokens,
        timestamp: Number(blockchainSignal.createdAt),
        status: this.mapStatus(blockchainSignal.status),
        expiresAt: new Date(Number(blockchainSignal.expiresAt) * 1000),
        correctPredictions: blockchainSignal.correctPredictions,
        fid: Number(blockchainSignal.fid),
        user: user,
      };

      if (existingSignal) {
        // Update existing signal
        Object.assign(existingSignal, signalData);
        return await this.signalRepository.save(existingSignal);
      } else {
        // Create new signal
        const newSignal = this.signalRepository.create(signalData);
        return await this.signalRepository.save(newSignal);
      }
    } catch (error) {
      this.logger.error(
        `Error syncing signal ${signalId} from blockchain:`,
        error,
      );
      return null;
    }
  }

  /**
   * Settle signals on blockchain (requires signer)
   */
  async settleSignalOnBlockchain(
    signalId: number,
    exitMarketCap: string,
  ): Promise<boolean> {
    if (!this.signer) {
      this.logger.error('Cannot settle signal: no signer available');
      return false;
    }

    try {
      const tx = await this.contract.settleSignal(signalId, exitMarketCap);
      const receipt = await tx.wait();

      this.logger.log(
        `Signal ${signalId} settled on blockchain. TX: ${receipt.hash}`,
      );

      // Sync the updated signal back to our database
      await this.syncSignalFromBlockchain(signalId);

      return true;
    } catch (error) {
      this.logger.error(
        `Error settling signal ${signalId} on blockchain:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get expired signals from blockchain (optimized with batching)
   */
  async getExpiredSignalsFromBlockchain(limit: number = 20): Promise<Signal[]> {
    try {
      // First, check database for potentially expired signals to reduce blockchain calls
      const currentTime = new Date();
      const potentiallyExpiredSignals = await this.signalRepository.find({
        where: {
          status: 'ACTIVE',
          expiresAt: { $lte: currentTime } as any,
        },
        order: { timestamp: 'DESC' },
        take: limit * 2, // Get more from DB to account for false positives
      });

      this.logger.log(`Found ${potentiallyExpiredSignals.length} potentially expired signals in database`);

      const signals: Signal[] = [];
      const batchSize = 3;
      
      // Process in batches of 3 to prevent overwhelming Alchemy
      for (let i = 0; i < potentiallyExpiredSignals.length && signals.length < limit; i += batchSize) {
        const batch = potentiallyExpiredSignals.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (dbSignal) => {
          try {
            const blockchainSignal = await this.getSignalFromBlockchain(Number(dbSignal.signalId));
            if (
              blockchainSignal &&
              blockchainSignal.status === 0 &&
              Number(blockchainSignal.expiresAt) <= Math.floor(Date.now() / 1000)
            ) {
              const syncedSignal = await this.syncSignalFromBlockchain(Number(dbSignal.signalId));
              return syncedSignal;
            }
            return null;
          } catch (error) {
            this.logger.warn(`Error checking signal ${dbSignal.signalId}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            signals.push(result.value);
            if (signals.length >= limit) break;
          }
        }

        // Add delay between batches
        if (i + batchSize < potentiallyExpiredSignals.length && signals.length < limit) {
          await this.delay(400);
        }
      }

      this.logger.log(`Retrieved ${signals.length} expired signals from blockchain`);
      return signals;
    } catch (error) {
      this.logger.error(
        'Error fetching expired signals from blockchain:',
        error,
      );
      return [];
    }
  }

  /**
   * Batch settle signals on blockchain
   */
  async batchSettleSignalsOnBlockchain(
    settlements: Array<{ signalId: number; exitMarketCap: string }>,
  ): Promise<boolean> {
    if (!this.signer) {
      this.logger.error('Cannot batch settle signals: no signer available');
      return false;
    }

    try {
      // For now, settle them one by one since the contract doesn't have batch settlement
      let allSuccessful = true;

      for (const settlement of settlements) {
        const success = await this.settleSignalOnBlockchain(
          settlement.signalId,
          settlement.exitMarketCap,
        );
        if (!success) {
          allSuccessful = false;
        }
      }

      this.logger.log(
        `Batch settled ${settlements.length} signals. All successful: ${allSuccessful}`,
      );
      return allSuccessful;
    } catch (error) {
      this.logger.error('Error batch settling signals on blockchain:', error);
      return false;
    }
  }

  /**
   * Get recent signals from blockchain (optimized with batching)
   */
  async getRecentSignalsFromBlockchain(limit: number = 20): Promise<Signal[]> {
    try {
      const nextSignalId = Number(await this.contract.nextSignalId());
      const syncedSignals: Signal[] = [];
      const batchSize = 5;
      
      // Limit the total range to prevent excessive calls
      const maxSignalsToCheck = Math.min(limit * 2, 100);
      const startId = Math.max(1, nextSignalId - maxSignalsToCheck);
      
      this.logger.log(`Checking signals from ${startId} to ${nextSignalId - 1} in batches of ${batchSize}`);
      
      // Process signals in batches to prevent rate limiting
      for (let i = nextSignalId - 1; i >= startId && syncedSignals.length < limit; i -= batchSize) {
        const batchIds = [];
        for (let j = 0; j < batchSize && i - j >= startId; j++) {
          batchIds.push(i - j);
        }
        
        // Process batch in parallel with Promise.allSettled for better error handling
        const batchPromises = batchIds.map(async (signalId) => {
          try {
            const blockchainSignal = await this.getSignalFromBlockchain(signalId);
            if (blockchainSignal) {
              const syncedSignal = await this.syncSignalFromBlockchain(signalId);
              return syncedSignal;
            }
            return null;
          } catch (error) {
            this.logger.warn(`Error processing signal ${signalId}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect successful results
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            syncedSignals.push(result.value);
            if (syncedSignals.length >= limit) break;
          }
        }

        // Add delay between batches to prevent rate limiting
        if (i - batchSize >= startId && syncedSignals.length < limit) {
          await this.delay(500);
        }
      }

      this.logger.log(`Retrieved ${syncedSignals.length} recent signals from blockchain`);
      return syncedSignals.slice(0, limit);
    } catch (error) {
      this.logger.error(
        'Error fetching recent signals from blockchain:',
        error,
      );
      return [];
    }
  }

  /**
   * Sync user account from blockchain to database when AccountCreated event is emitted
   */
  async syncUserAccountFromBlockchain(
    walletAddress: string,
    fid: number,
  ): Promise<void> {
    try {
      this.logger.log(
        `🔗 SYNC: Starting user account sync for FID ${fid} with wallet ${walletAddress}`,
      );

      const blockchainAccount =
        await this.getAccountFromBlockchain(walletAddress);
      if (!blockchainAccount) {
        this.logger.error(
          `❌ SYNC: No blockchain account found for wallet ${walletAddress}`,
        );
        return;
      }

      this.logger.log(
        `📋 SYNC: Retrieved blockchain account data - FID: ${blockchainAccount.fid}, Banned: ${blockchainAccount.isBanned}, Subscriber: ${blockchainAccount.isSubscriber}`,
      );

      let user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.log(`👤 SYNC: Creating NEW user for FID ${fid}`);
        user = this.userRepository.create({
          fid,
          username: `user_${fid}`,
          walletAddress: walletAddress.toLowerCase(),
          stateOnTheSystem: UserStateOnTheSystemEnum.WITH_ACCOUNT,
          isBanned: blockchainAccount.isBanned,
          isSubscriber: blockchainAccount.isSubscriber,
        });

        await this.userRepository.save(user);
        this.logger.log(
          `✅ SYNC: Created new user FID ${fid} with state WITH_ACCOUNT`,
        );
      } else {
        const previousState = user.stateOnTheSystem;
        const previousWallet = user.walletAddress;

        // Update existing user
        user.walletAddress = walletAddress.toLowerCase();
        user.stateOnTheSystem = UserStateOnTheSystemEnum.WITH_ACCOUNT;
        user.isBanned = blockchainAccount.isBanned;
        user.isSubscriber = blockchainAccount.isSubscriber;

        await this.userRepository.save(user);
        this.logger.log(`🔄 SYNC: Updated existing user FID ${fid}`);
        this.logger.log(
          `📊 SYNC: State transition: ${previousState} → ${user.stateOnTheSystem}`,
        );
        this.logger.log(
          `💳 SYNC: Wallet update: ${previousWallet || 'null'} → ${user.walletAddress}`,
        );
      }

      this.logger.log(
        `✅ SYNC: Successfully synced user account for FID ${fid} - User is now ready for blockchain interactions`,
      );
    } catch (error) {
      this.logger.error(
        `❌ SYNC: Error syncing user account for FID ${fid}:`,
        error,
      );
    }
  }

  /**
   * Update user stats based on their signals
   */
  async updateUserStats(fid: number): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
        relations: ['signals'],
      });

      if (!user) return;

      // Calculate stats from user's signals
      const totalSignals = user.signals.length;
      const activeSignals = user.signals.filter(
        (signal) => signal.status === 'ACTIVE',
      ).length;
      const settledSignals = user.signals.filter((signal) =>
        ['WON', 'LOST', 'EXPIRED'].includes(signal.status),
      ).length;
      const wonSignals = user.signals.filter(
        (signal) => signal.status === 'WON',
      ).length;
      const winRate =
        settledSignals > 0 ? (wonSignals / settledSignals) * 100 : 0;

      // Update user stats
      user.totalSignals = totalSignals;
      user.activeSignals = activeSignals;
      user.settledSignals = settledSignals;
      user.winRate = winRate;

      // Calculate MFS Score (0-1 scale based on win rate and settled signals)
      if (user.settledSignals >= 5) {
        const winRateWeight = user.winRate / 100;
        const volumeWeight = Math.min(user.settledSignals / 100, 1); // Cap at 100 signals
        user.mfsScore = winRateWeight * 0.7 + volumeWeight * 0.3;
      }

      await this.userRepository.save(user);
      this.logger.log(`Updated stats for user FID ${fid}`);
    } catch (error) {
      this.logger.error(`Error updating user stats for FID ${fid}:`, error);
    }
  }

  /**
   * Listen for blockchain events (real-time only)
   */
  async startEventListening(): Promise<void> {
    this.logger.log(
      '🎧 EVENT LISTENER: Starting real-time blockchain event listening...',
    );

    try {
      // Listen for AccountCreated events
      this.contract.on(
        'AccountCreated',
        async (user, fid, pfpUrl, username, timestamp, event) => {
          console.log('AccountCreated event', event);
          const blockNumber = event?.blockNumber || 'unknown';
          const transactionHash = event?.transactionHash || 'unknown';
          this.logger.log(
            `🔥 REAL-TIME: AccountCreated event detected - FID ${fid}, Wallet ${user}, Block ${blockNumber}, TX ${transactionHash}`,
          );
          try {
            await this.queueEvent('AccountCreated', { user, fid: Number(fid) });
            this.logger.log(
              `✅ REAL-TIME: AccountCreated event queued for FID ${fid}`,
            );
          } catch (error) {
            this.logger.error(
              `❌ REAL-TIME: Error queuing AccountCreated event for FID ${fid}:`,
              error,
            );
          }
        },
      );

      // Listen for Subscribed events
      this.contract.on('Subscribed', async (user, fid, expiresAt, event) => {
        const blockNumber = event?.blockNumber || 'unknown';
        const transactionHash = event?.transactionHash || 'unknown';
        this.logger.log(
          `🔥 REAL-TIME: Subscribed event detected - FID ${fid}, Wallet ${user}, Expires: ${new Date(Number(expiresAt) * 1000).toISOString()}, Block ${blockNumber}, TX ${transactionHash}`,
        );
        try {
          await this.queueEvent('Subscribed', {
            fid: Number(fid),
            expiresAt: new Date(Number(expiresAt) * 1000),
          });
          this.logger.log(
            `✅ REAL-TIME: Subscribed event queued for FID ${fid}`,
          );
        } catch (error) {
          this.logger.error(
            `❌ REAL-TIME: Error queuing Subscribed event for FID ${fid}:`,
            error,
          );
        }
      });

      // Listen for SessionStarted events
      this.contract.on(
        'SessionStarted',
        async (user, fid, startTime, expiresAt, event) => {
          const blockNumber = event?.blockNumber || 'unknown';
          const transactionHash = event?.transactionHash || 'unknown';
          this.logger.log(
            `🔥 REAL-TIME: SessionStarted event detected - FID ${fid}, Wallet ${user}, Start: ${new Date(Number(startTime) * 1000).toISOString()}, Expires: ${new Date(Number(expiresAt) * 1000).toISOString()}, Block ${blockNumber}, TX ${transactionHash}`,
          );
          try {
            const dbUser = await this.userRepository.findOne({
              where: { fid: Number(fid) },
            });
            if (dbUser) {
              this.logger.log(
                `✅ REAL-TIME: Session started for user FID ${fid} - Session active until ${new Date(Number(expiresAt) * 1000).toISOString()}`,
              );
            } else {
              this.logger.warn(
                `⚠️  REAL-TIME: SessionStarted event for unknown user FID ${fid}`,
              );
            }
          } catch (error) {
            this.logger.error(
              `❌ REAL-TIME: Error processing SessionStarted event for FID ${fid}:`,
              error,
            );
          }
        },
      );

      // Listen for SignalCreated events
      this.contract.on(
        'SignalCreated',
        async (signalId, fid, tokens, expiresAt, timestamp, event) => {
          const blockNumber = event?.blockNumber || 'unknown';
          const transactionHash = event?.transactionHash || 'unknown';
          this.logger.log(
            `🔥 REAL-TIME: SignalCreated event detected - Signal ${signalId}, FID ${fid}, Tokens: ${tokens.length}, Block ${blockNumber}, TX ${transactionHash}`,
          );
          try {
            await this.queueEvent('SignalCreated', {
              signalId: Number(signalId),
              fid: Number(fid),
            });
            this.logger.log(
              `✅ REAL-TIME: SignalCreated event queued - Signal ${signalId}`,
            );
          } catch (error) {
            this.logger.error(
              `❌ REAL-TIME: Error queuing SignalCreated event for Signal ${signalId}:`,
              error,
            );
          }
        },
      );

      // Listen for SignalSettled events
      this.contract.on(
        'SignalSettled',
        async (signalId, fid, status, correctPredictions, timestamp, event) => {
          const blockNumber = event?.blockNumber || 'unknown';
          const transactionHash = event?.transactionHash || 'unknown';
          this.logger.log(
            `🔥 REAL-TIME: SignalSettled event detected - Signal ${signalId}, FID ${fid}, Status ${status}, Correct: ${correctPredictions}/8, Block ${blockNumber}, TX ${transactionHash}`,
          );
          try {
            await this.queueEvent('SignalSettled', {
              signalId: Number(signalId),
              fid: Number(fid),
              status,
              correctPredictions,
            });
            this.logger.log(
              `✅ REAL-TIME: SignalSettled event queued - Signal ${signalId}`,
            );
          } catch (error) {
            this.logger.error(
              `❌ REAL-TIME: Error queuing SignalSettled event for Signal ${signalId}:`,
              error,
            );
          }
        },
      );

      this.logger.log(
        '✅ EVENT LISTENER: All blockchain event listeners are now active and monitoring for real-time events',
      );
    } catch (error) {
      this.logger.error(
        '❌ EVENT LISTENER: Error setting up blockchain event listeners:',
        error,
      );
      // Don't throw the error - we want the service to continue running
      // even if event listening fails
    }
  }

  /**
   * Stop event listening
   */
  stopEventListening(): void {
    this.contract.removeAllListeners();
    this.logger.log('Blockchain event listeners stopped');
  }

  /**
   * Get contract statistics
   */
  async getContractStats(): Promise<{
    totalSignals: number;
    totalAccounts: number;
    nextSignalId: number;
    usdcBalance: number;
    jbmBalance: number;
  }> {
    try {
      const [totalSignals, totalAccounts, nextSignalId, contractStats] =
        await Promise.all([
          this.contract.totalSignals(),
          this.contract.totalAccounts(),
          this.contract.nextSignalId(),
          this.contract.getContractStats(),
        ]);

      return {
        totalSignals: Number(totalSignals),
        totalAccounts: Number(totalAccounts),
        nextSignalId: Number(nextSignalId),
        usdcBalance: Number(contractStats._usdcBalance),
        jbmBalance: Number(contractStats._jbmBalance),
      };
    } catch (error) {
      this.logger.error('Error fetching contract stats:', error);
      return {
        totalSignals: 0,
        totalAccounts: 0,
        nextSignalId: 0,
        usdcBalance: 0,
        jbmBalance: 0,
      };
    }
  }

  /**
   * Check if a transaction hash represents a session start (SignalCreated event)
   */
  async verifySessionStartTransaction(
    transactionHash: string,
  ): Promise<boolean> {
    try {
      this.logger.log(
        `Verifying session start transaction: ${transactionHash}`,
      );

      const receipt =
        await this.provider.getTransactionReceipt(transactionHash);
      if (!receipt) {
        this.logger.warn(
          `No receipt found for transaction: ${transactionHash}`,
        );
        return false;
      }

      // Check if the transaction was successful
      if (receipt.status !== 1) {
        this.logger.warn(`Transaction failed: ${transactionHash}`);
        return false;
      }

      // Check if the transaction contains a SignalCreated event from our contract
      const signalCreatedTopic =
        this.contract.interface.getEvent('SignalCreated').topicHash;
      const hasSignalCreatedEvent = receipt.logs.some(
        (log) =>
          log.address.toLowerCase() === this.CONTRACT_ADDRESS.toLowerCase() &&
          log.topics[0] === signalCreatedTopic,
      );

      if (hasSignalCreatedEvent) {
        this.logger.log(
          `Session start verified for transaction: ${transactionHash}`,
        );
        return true;
      } else {
        this.logger.warn(
          `No SignalCreated event found in transaction: ${transactionHash}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error verifying session start transaction ${transactionHash}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get recent signals for a user's home feed
   * This includes signals from followed users and recent popular signals
   */
  async getLastSignalsForUsersHomeFeed(fid: number): Promise<any[]> {
    try {
      this.logger.log(`Getting home feed signals for user ${fid}`);

      // Get recent signals from the last 24 hours, ordered by timestamp
      const recentSignals = await this.signalRepository
        .createQueryBuilder('signal')
        .leftJoinAndSelect('signal.user', 'user')
        .where('signal.timestamp >= :cutoff', {
          cutoff: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
        })
        .orderBy('signal.timestamp', 'DESC')
        .limit(22) // Limit to 22 recent signals
        .getMany();

      // Transform signals to include user info and token details
      const feedSignals = recentSignals.map((signal) => {
        const primaryToken = signal.tokens?.[0]; // Get the first token as primary
        return {
          signalId: signal.signalId,
          fid: signal.fid,
          username: signal.user?.username || 'Unknown',
          displayName:
            signal.user?.displayName || signal.user?.username || 'Unknown',
          pfpUrl: signal.user?.pfpUrl || '',
          isVerified: signal.user?.isVerified || false,
          tokenAddress: primaryToken?.ca || '',
          ticker: primaryToken?.ticker || '',
          direction: primaryToken?.direction || '',
          timestamp: signal.timestamp,
          status: signal.status,
          expiresAt: signal.timestamp + 1000 * 60 * 60 * 24,
        };
      });

      this.logger.log(`Retrieved ${feedSignals.length} signals for home feed`);
      return feedSignals;
    } catch (error) {
      this.logger.error(
        `Error getting home feed signals for user ${fid}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Check if a user has an active subscription
   */
  async checkUserSubscriptionStatus(fid: number): Promise<{
    isSubscriber: boolean;
    subscriptionExpiresAt: Date | null;
    canSignal: boolean;
  }> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        return {
          isSubscriber: false,
          subscriptionExpiresAt: null,
          canSignal: false,
        };
      }

      const now = new Date();
      const isActiveSubscriber =
        user.isSubscriber &&
        user.subscriptionExpiresAt &&
        user.subscriptionExpiresAt > now;

      return {
        isSubscriber: isActiveSubscriber,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        canSignal: isActiveSubscriber || !user.submittedSignalToday,
      };
    } catch (error) {
      this.logger.error(
        `Error checking subscription status for FID ${fid}:`,
        error,
      );
      return {
        isSubscriber: false,
        subscriptionExpiresAt: null,
        canSignal: false,
      };
    }
  }

  /**
   * Get the user's favorite 20 signalers (users they follow or favorite)
   * For now, this returns the top 20 users by MFS score as a placeholder
   */
  async getFavoriteTwentySignelersForFid(fid: number): Promise<any[]> {
    try {
      this.logger.log(`Getting favorite signalers for user ${fid}`);

      // Get top 20 users by MFS score as favorite signalers
      // In a real implementation, this would be based on user's follows/favorites
      const favoriteSignalers = await this.userRepository
        .createQueryBuilder('user')
        .where('user.fid != :currentFid', { currentFid: fid }) // Exclude current user
        .andWhere('user.settledSignals >= 5') // Only users with some activity
        .orderBy('user.mfsScore', 'DESC')
        .addOrderBy('user.settledSignals', 'DESC')
        .limit(20)
        .getMany();

      // Transform to include relevant user info
      const signalers = favoriteSignalers.map((user) => ({
        fid: user.fid,
        username: user.username,
        displayName: user.displayName || user.username,
        pfpUrl: user.pfpUrl || '',
        isVerified: user.isVerified || false,
        mfsScore: Number(user.mfsScore),
        winRate: Number(user.winRate),
        settledSignals: user.settledSignals,
        totalSignals: user.totalSignals,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
      }));

      this.logger.log(
        `Retrieved ${signalers.length} favorite signalers for user ${fid}`,
      );
      return signalers;
    } catch (error) {
      this.logger.error(
        `Error getting favorite signalers for user ${fid}:`,
        error,
      );
      return [];
    }
  }
}
