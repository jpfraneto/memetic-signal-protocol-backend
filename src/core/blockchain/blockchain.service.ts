import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { getConfig } from '../../security/config';
import { MEMETIC_SIGNAL_PROTOCOL_ABI } from '../../security/MEMETIC_SIGNAL_PROTOCOL_ABI';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor() {
    const config = getConfig();

    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    );

    // Initialize wallet (resolver wallet)
    if (!config.blockchain.backendPrivateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    this.wallet = new ethers.Wallet(
      config.blockchain.backendPrivateKey,
      this.provider,
    );

    // Initialize contract
    if (!config.blockchain.contractAddress) {
      throw new Error('CONTRACT_ADDRESS environment variable is required');
    }

    this.contract = new ethers.Contract(
      config.blockchain.contractAddress,
      MEMETIC_SIGNAL_PROTOCOL_ABI,
      this.wallet,
    );
  }

  /**
   * Resolve a single signal with MFS delta
   */
  async resolveSignal(signalId: number, mfsDelta: bigint): Promise<string> {
    try {
      this.logger.log(
        `Resolving signal ${signalId} with MFS delta: ${mfsDelta}`,
      );

      const tx = await this.contract.resolveSignal(signalId, mfsDelta);
      const receipt = await tx.wait();

      this.logger.log(
        `Signal ${signalId} resolved successfully. Tx: ${receipt.hash}`,
      );
      return receipt.hash;
    } catch (error) {
      this.logger.error(`Failed to resolve signal ${signalId}:`, error);
      throw error;
    }
  }

  /**
   * Batch resolve multiple signals with their MFS deltas
   */
  async batchResolveSignals(
    signalIds: number[],
    mfsDeltas: bigint[],
  ): Promise<string> {
    try {
      if (signalIds.length !== mfsDeltas.length) {
        throw new Error(
          'Signal IDs and MFS deltas arrays must have the same length',
        );
      }

      this.logger.log(
        `Batch resolving ${signalIds.length} signals: ${signalIds.join(', ')}`,
      );

      const tx = await this.contract.batchResolveSignals(signalIds, mfsDeltas);
      const receipt = await tx.wait();

      this.logger.log(
        `Batch resolved ${signalIds.length} signals successfully. Tx: ${receipt.hash}`,
      );
      return receipt.hash;
    } catch (error) {
      this.logger.error(`Failed to batch resolve signals:`, error);
      throw error;
    }
  }

  /**
   * Get signal data from the contract
   */
  async getSignal(signalId: number): Promise<{
    fid: bigint;
    ca: string;
    direction: boolean;
    durationDays: number;
    createdAt: bigint;
    expiresAt: bigint;
    resolved: boolean;
    mfsApplied: bigint;
  }> {
    try {
      const signal = await this.contract.signals(signalId);
      return {
        fid: signal.fid,
        ca: signal.ca,
        direction: signal.direction,
        durationDays: Number(signal.durationDays),
        createdAt: signal.createdAt,
        expiresAt: signal.expiresAt,
        resolved: signal.resolved,
        mfsApplied: signal.mfsApplied,
      };
    } catch (error) {
      this.logger.error(`Failed to get signal ${signalId}:`, error);
      throw error;
    }
  }

  /**
   * Get the current gas price for estimating transaction costs
   */
  async getGasPrice(): Promise<bigint> {
    return await this.provider.getFeeData().then((data) => data.gasPrice || 0n);
  }

  /**
   * Get the next signal ID from the contract
   */
  async getNextSignalId(): Promise<number> {
    try {
      const nextId = await this.contract.nextSignalId();
      return Number(nextId);
    } catch (error) {
      this.logger.error('Failed to get next signal ID:', error);
      throw error;
    }
  }

  /**
   * Check if the wallet is authorized as the resolver
   */
  async isResolver(): Promise<boolean> {
    try {
      const resolverAddress = await this.contract.resolver();
      return (
        resolverAddress.toLowerCase() === this.wallet.address.toLowerCase()
      );
    } catch (error) {
      this.logger.error('Failed to check resolver status:', error);
      return false;
    }
  }

  /**
   * Get the total MFS for a given FID
   */
  async getTotalMFS(fid: number): Promise<bigint> {
    try {
      return await this.contract.totalMFS(fid);
    } catch (error) {
      this.logger.error(`Failed to get total MFS for FID ${fid}:`, error);
      throw error;
    }
  }

  /**
   * Get the contract deployment timestamp
   */
  async getDeploymentTimestamp(): Promise<number> {
    try {
      const timestamp = await this.contract.deploymentTimestamp();
      return Number(timestamp);
    } catch (error) {
      this.logger.error('Failed to get deployment timestamp:', error);
      throw error;
    }
  }

  /**
   * Get the current day index based on contract deployment time
   */
  async getCurrentDayIndex(): Promise<number> {
    try {
      const deploymentTimestamp = await this.getDeploymentTimestamp();
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const dayIndex = Math.floor(
        (currentTimestamp - deploymentTimestamp) / 86400,
      );
      return dayIndex;
    } catch (error) {
      this.logger.error('Failed to get current day index:', error);
      throw error;
    }
  }
}
