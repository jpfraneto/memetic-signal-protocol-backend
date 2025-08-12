import { Injectable, Logger } from '@nestjs/common';
import { ethers, Contract, JsonRpcProvider } from 'ethers';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Call } from '../../models/Call/Call.model';
import { User } from '../../models/User/User.model';
import { CallDirection, CallTimeframe, CallStatus } from '../../models/Call/Call.types';

// Smart contract ABI for ProjectLighthouseV3
const CONTRACT_ABI = [
  // Events
  'event SignalCreated(uint256 indexed signalId, uint256 indexed fid, address indexed token, string ticker, uint8 direction, uint8 timeframe, uint256 entryPrice, uint256 expiresAt, uint256 timestamp)',
  'event SignalSettled(uint256 indexed signalId, uint256 indexed fid, address indexed token, uint8 status, uint256 exitPrice, int256 pnlBasisPoints, uint256 settledAt)',
  'event MFSUpdated(uint256 indexed fid, uint256 newScore, uint256 totalCalls, uint256 wonCalls, uint256 timestamp)',
  
  // Write functions
  'function makeCall(uint256 fid, address token, string ticker, uint8 direction, uint8 timeframe, uint256 entryPrice) external',
  'function settleSignal(uint256 signalId, uint256 exitPrice) external',
  'function batchSettleSignals(uint256[] signalIds, uint256[] exitPrices) external',
  
  // Read functions
  'function getSignal(uint256 signalId) external view returns (tuple(uint256 fid, address token, string ticker, uint8 direction, uint8 timeframe, uint256 entryPrice, uint256 exitPrice, uint256 createdAt, uint256 expiresAt, uint256 settledAt, uint8 status, int256 pnlBasisPoints))',
  'function getUserSignals(uint256 fid) external view returns (uint256[])',
  'function getUserStats(uint256 fid) external view returns (tuple(uint256 totalCalls, uint256 settledCalls, uint256 wonCalls, int256 totalPnlBasisPoints, uint256 lastCallAt, uint256 mfsScore, uint256 mfsLastUpdated))',
  'function getActiveSignals(uint256 fid) external view returns (tuple(uint256 fid, address token, string ticker, uint8 direction, uint8 timeframe, uint256 entryPrice, uint256 exitPrice, uint256 createdAt, uint256 expiresAt, uint256 settledAt, uint8 status, int256 pnlBasisPoints)[])',
  'function getRecentSignals(uint256 offset, uint256 limit) external view returns (tuple(uint256 fid, address token, string ticker, uint8 direction, uint8 timeframe, uint256 entryPrice, uint256 exitPrice, uint256 createdAt, uint256 expiresAt, uint256 settledAt, uint8 status, int256 pnlBasisPoints)[])',
  'function getExpiredSignals(uint256 maxResults) external view returns (uint256[])',
  'function getUserMFS(uint256 fid) external view returns (uint256)',
  'function getUserWinRate(uint256 fid) external view returns (uint256)',
  'function nextSignalId() external view returns (uint256)',
  'function totalSignals() external view returns (uint256)',
  'function totalActiveSignals() external view returns (uint256)',
  'function totalSettledSignals() external view returns (uint256)'
];

interface BlockchainSignal {
  fid: bigint;
  token: string;
  ticker: string;
  direction: number;
  timeframe: number;
  entryPrice: bigint;
  exitPrice: bigint;
  createdAt: bigint;
  expiresAt: bigint;
  settledAt: bigint;
  status: number;
  pnlBasisPoints: bigint;
}

interface BlockchainUserStats {
  totalCalls: bigint;
  settledCalls: bigint;
  wonCalls: bigint;
  totalPnlBasisPoints: bigint;
  lastCallAt: bigint;
  mfsScore: bigint;
  mfsLastUpdated: bigint;
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly provider: JsonRpcProvider;
  private contract: Contract;
  private readonly signer?: ethers.Wallet;
  
  // Contract address on Base mainnet
  private readonly CONTRACT_ADDRESS = '0xdeB0E09366048944aC9033d5517Bf4Dcc39f2C97';
  private readonly BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  private readonly PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;

  constructor(
    @InjectRepository(Call)
    private callRepository: Repository<Call>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    // Initialize provider
    this.provider = new JsonRpcProvider(this.BASE_RPC_URL);
    
    // Initialize contract
    this.contract = new Contract(this.CONTRACT_ADDRESS, CONTRACT_ABI, this.provider);
    
    // Initialize signer if private key is provided (for settlement operations)
    if (this.PRIVATE_KEY) {
      this.signer = new ethers.Wallet(this.PRIVATE_KEY, this.provider);
      this.contract = this.contract.connect(this.signer) as Contract;
      this.logger.log('Blockchain service initialized with signer for settlement operations');
    } else {
      this.logger.warn('No private key provided - settlement operations will be disabled');
    }

    this.logger.log(`Contract initialized at ${this.CONTRACT_ADDRESS} on Base network`);
  }

  /**
   * Convert blockchain direction enum to our internal type
   */
  private mapDirection(direction: number): CallDirection {
    return direction === 0 ? 'up' : 'down';
  }

  /**
   * Convert blockchain timeframe enum to our internal type
   */
  private mapTimeframe(timeframe: number): CallTimeframe {
    switch (timeframe) {
      case 0: return '24h';
      case 1: return '7d';  
      case 2: return '30d';
      default: return '24h';
    }
  }

  /**
   * Convert blockchain status enum to our internal type
   */
  private mapStatus(status: number): CallStatus {
    switch (status) {
      case 0: return 'active';
      case 1: return 'won';
      case 2: return 'lost';
      case 3: return 'expired';
      default: return 'active';
    }
  }

  /**
   * Convert our internal direction to blockchain enum
   */
  private mapDirectionToEnum(direction: CallDirection): number {
    return direction === 'up' ? 0 : 1;
  }

  /**
   * Convert our internal timeframe to blockchain enum
   */
  private mapTimeframeToEnum(timeframe: CallTimeframe): number {
    switch (timeframe) {
      case '24h': return 0;
      case '7d': return 1;
      case '30d': return 2;
      default: return 0;
    }
  }

  /**
   * Get signal data from blockchain by signal ID
   */
  async getSignalFromBlockchain(signalId: number): Promise<BlockchainSignal | null> {
    try {
      const signal = await this.contract.getSignal(signalId);
      return signal;
    } catch (error) {
      this.logger.error(`Error fetching signal ${signalId} from blockchain:`, error);
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
   * Get user stats from blockchain
   */
  async getUserStatsFromBlockchain(fid: number): Promise<BlockchainUserStats | null> {
    try {
      const stats = await this.contract.getUserStats(fid);
      return stats;
    } catch (error) {
      this.logger.error(`Error fetching user stats for FID ${fid}:`, error);
      return null;
    }
  }

  /**
   * Sync a specific signal from blockchain to database
   */
  async syncSignalFromBlockchain(signalId: number): Promise<Call | null> {
    try {
      const blockchainSignal = await this.getSignalFromBlockchain(signalId);
      if (!blockchainSignal) {
        return null;
      }

      // Check if signal already exists in database
      let existingCall = await this.callRepository.findOne({
        where: { signalId: signalId.toString() },
        relations: ['user']
      });

      // Get or create user
      let user = await this.userRepository.findOne({
        where: { fid: Number(blockchainSignal.fid) }
      });

      if (!user) {
        // Create user if doesn't exist
        user = this.userRepository.create({
          fid: Number(blockchainSignal.fid),
          username: `user_${blockchainSignal.fid}`, // Placeholder, should be updated from Farcaster
        });
        await this.userRepository.save(user);
      }

      const callData = {
        signalId: signalId.toString(),
        transactionHash: '', // Will be filled when we have the transaction hash
        tokenAddress: blockchainSignal.token.toLowerCase(),
        ticker: blockchainSignal.ticker,
        direction: this.mapDirection(blockchainSignal.direction),
        timestamp: Number(blockchainSignal.createdAt),
        callPrice: Number(ethers.formatEther(blockchainSignal.entryPrice)),
        currentPrice: blockchainSignal.exitPrice > 0n ? Number(ethers.formatEther(blockchainSignal.exitPrice)) : null,
        timeframe: this.mapTimeframe(blockchainSignal.timeframe),
        status: this.mapStatus(blockchainSignal.status),
        expiresAt: new Date(Number(blockchainSignal.expiresAt) * 1000),
        pnlPercentage: blockchainSignal.pnlBasisPoints !== 0n ? Number(blockchainSignal.pnlBasisPoints) / 100 : null,
        fid: Number(blockchainSignal.fid),
        user: user,
      };

      if (existingCall) {
        // Update existing call
        Object.assign(existingCall, callData);
        return await this.callRepository.save(existingCall);
      } else {
        // Create new call
        const newCall = this.callRepository.create(callData);
        return await this.callRepository.save(newCall);
      }
    } catch (error) {
      this.logger.error(`Error syncing signal ${signalId} from blockchain:`, error);
      return null;
    }
  }

  /**
   * Settle signals on blockchain (requires signer)
   */
  async settleSignalOnBlockchain(signalId: number, exitPrice: number): Promise<boolean> {
    if (!this.signer) {
      this.logger.error('Cannot settle signal: no signer available');
      return false;
    }

    try {
      const exitPriceWei = ethers.parseEther(exitPrice.toString());
      
      const tx = await this.contract.settleSignal(signalId, exitPriceWei);
      const receipt = await tx.wait();
      
      this.logger.log(`Signal ${signalId} settled on blockchain. TX: ${receipt.hash}`);
      
      // Sync the updated signal back to our database
      await this.syncSignalFromBlockchain(signalId);
      
      return true;
    } catch (error) {
      this.logger.error(`Error settling signal ${signalId} on blockchain:`, error);
      return false;
    }
  }

  /**
   * Batch settle signals on blockchain
   */
  async batchSettleSignalsOnBlockchain(settlements: Array<{signalId: number, exitPrice: number}>): Promise<boolean> {
    if (!this.signer) {
      this.logger.error('Cannot batch settle signals: no signer available');
      return false;
    }

    try {
      const signalIds = settlements.map(s => s.signalId);
      const exitPrices = settlements.map(s => ethers.parseEther(s.exitPrice.toString()));
      
      const tx = await this.contract.batchSettleSignals(signalIds, exitPrices);
      const receipt = await tx.wait();
      
      this.logger.log(`Batch settled ${settlements.length} signals. TX: ${receipt.hash}`);
      
      // Sync all updated signals back to our database
      for (const settlement of settlements) {
        await this.syncSignalFromBlockchain(settlement.signalId);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error batch settling signals:`, error);
      return false;
    }
  }

  /**
   * Get expired signals from blockchain
   */
  async getExpiredSignalsFromBlockchain(maxResults: number = 50): Promise<number[]> {
    try {
      const expiredIds = await this.contract.getExpiredSignals(maxResults);
      return expiredIds.map((id: bigint) => Number(id));
    } catch (error) {
      this.logger.error('Error fetching expired signals from blockchain:', error);
      return [];
    }
  }

  /**
   * Get recent signals from blockchain with pagination
   */
  async getRecentSignalsFromBlockchain(offset: number = 0, limit: number = 20): Promise<Call[]> {
    try {
      const signals = await this.contract.getRecentSignals(offset, limit);
      const calls: Call[] = [];

      for (const signal of signals) {
        const call = await this.syncSignalFromBlockchain(Number(await this.contract.nextSignalId()) - 1 - offset);
        if (call) {
          calls.push(call);
        }
      }

      return calls;
    } catch (error) {
      this.logger.error('Error fetching recent signals from blockchain:', error);
      return [];
    }
  }

  /**
   * Sync user stats from blockchain to database
   */
  async syncUserStatsFromBlockchain(fid: number): Promise<void> {
    try {
      const blockchainStats = await this.getUserStatsFromBlockchain(fid);
      if (!blockchainStats) {
        return;
      }

      let user = await this.userRepository.findOne({
        where: { fid }
      });

      if (!user) {
        user = this.userRepository.create({
          fid,
          username: `user_${fid}`, // Placeholder
        });
      }

      // Update user stats from blockchain
      user.totalCalls = Number(blockchainStats.totalCalls);
      user.settledCalls = Number(blockchainStats.settledCalls);
      user.activeCalls = user.totalCalls - user.settledCalls;
      
      // Calculate win rate
      if (user.settledCalls > 0) {
        user.winRate = (Number(blockchainStats.wonCalls) / user.settledCalls) * 100;
      }
      
      // MFS score from blockchain (convert from basis points)
      user.mfsScore = Number(blockchainStats.mfsScore) / 10000;

      await this.userRepository.save(user);
      
      this.logger.log(`Synced user stats for FID ${fid} from blockchain`);
    } catch (error) {
      this.logger.error(`Error syncing user stats for FID ${fid}:`, error);
    }
  }

  /**
   * Listen for blockchain events (for real-time updates)
   */
  startEventListening(): void {
    this.logger.log('Starting blockchain event listening...');

    // Listen for SignalCreated events
    this.contract.on('SignalCreated', async (signalId, fid, token, ticker, direction, timeframe, entryPrice, expiresAt, timestamp, event) => {
      this.logger.log(`New signal created: ${signalId} by FID ${fid}`);
      try {
        // Sync the new signal to our database
        await this.syncSignalFromBlockchain(Number(signalId));
        await this.syncUserStatsFromBlockchain(Number(fid));
      } catch (error) {
        this.logger.error('Error processing SignalCreated event:', error);
      }
    });

    // Listen for SignalSettled events
    this.contract.on('SignalSettled', async (signalId, fid, token, status, exitPrice, pnlBasisPoints, settledAt, event) => {
      this.logger.log(`Signal settled: ${signalId} for FID ${fid} with status ${status}`);
      try {
        // Sync the updated signal to our database
        await this.syncSignalFromBlockchain(Number(signalId));
        await this.syncUserStatsFromBlockchain(Number(fid));
      } catch (error) {
        this.logger.error('Error processing SignalSettled event:', error);
      }
    });

    // Listen for MFSUpdated events
    this.contract.on('MFSUpdated', async (fid, newScore, totalCalls, wonCalls, timestamp, event) => {
      this.logger.log(`MFS updated for FID ${fid}: ${newScore}`);
      try {
        await this.syncUserStatsFromBlockchain(Number(fid));
      } catch (error) {
        this.logger.error('Error processing MFSUpdated event:', error);
      }
    });

    this.logger.log('Blockchain event listeners started');
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
  async getContractStats(): Promise<{totalSignals: number, activeSignals: number, settledSignals: number, nextSignalId: number}> {
    try {
      const [totalSignals, activeSignals, settledSignals, nextSignalId] = await Promise.all([
        this.contract.totalSignals(),
        this.contract.totalActiveSignals(),
        this.contract.totalSettledSignals(),
        this.contract.nextSignalId()
      ]);

      return {
        totalSignals: Number(totalSignals),
        activeSignals: Number(activeSignals),
        settledSignals: Number(settledSignals),
        nextSignalId: Number(nextSignalId)
      };
    } catch (error) {
      this.logger.error('Error fetching contract stats:', error);
      return {totalSignals: 0, activeSignals: 0, settledSignals: 0, nextSignalId: 0};
    }
  }
}