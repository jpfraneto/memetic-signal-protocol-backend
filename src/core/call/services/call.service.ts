import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';

import { Call, CreateCallData } from '../../../models';
import { FarcasterUserService } from './farcaster-user.service';
import { TokenPriceService } from './token-price.service';
import { UserService } from '../../user/services/user.service';
import {
  CallResponseDto,
  CallsFeedResponseDto,
} from '../dto/call-response.dto';
import { GetCallsQueryDto } from '../dto/get-calls-query.dto';

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    @InjectRepository(Call)
    private readonly callRepository: Repository<Call>,
    private readonly farcasterUserService: FarcasterUserService,
    private readonly tokenPriceService: TokenPriceService,
    private readonly userService: UserService,
  ) {}

  async createCall(callData: CreateCallData): Promise<Call> {
    await this.checkForDuplicates(callData.signalId, callData.transactionHash);

    // Ensure user exists, create if not
    const { user } = await this.userService.upsert(callData.fid, {
      username: callData.username, // Default username, can be updated later
    });

    const call = this.callRepository.create({
      ...callData,
      user,
    });
    return await this.callRepository.save(call);
  }

  async getCalls(query: GetCallsQueryDto): Promise<CallsFeedResponseDto> {
    const { limit = 20, offset = 0, fid } = query;

    // Build query options
    const whereConditions: any = {};
    if (fid) {
      whereConditions.fid = fid;
    }

    const findOptions: FindManyOptions<Call> = {
      where: whereConditions,
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['user'],
    };

    // Execute queries in parallel
    const [calls, total] = await Promise.all([
      this.callRepository.find(findOptions),
      this.callRepository.count({ where: whereConditions }),
    ]);

    // Enrich calls with user profiles and current prices
    const enrichedCalls = await this.enrichCalls(calls);

    return {
      calls: enrichedCalls,
      total,
      hasMore: offset + calls.length < total,
    };
  }

  async getCallBySignalId(signalId: string): Promise<CallResponseDto> {
    const call = await this.callRepository.findOne({
      where: { signalId },
      relations: ['user'],
    });

    if (!call) {
      throw new NotFoundException(`Call with signalId ${signalId} not found`);
    }

    const enrichedCalls = await this.enrichCalls([call]);
    return enrichedCalls[0];
  }

  private async enrichCalls(calls: Call[]): Promise<CallResponseDto[]> {
    if (calls.length === 0) return [];

    try {
      // Get unique token addresses
      const tokenAddresses = [
        ...new Set(calls.map((call) => call.tokenAddress)),
      ];

      // Fetch current prices
      const priceMap =
        await this.tokenPriceService.getTokenPrices(tokenAddresses);

      // Enrich calls with additional data
      return calls.map((call) => {
        const user = call.user || {
          fid: call.fid,
          username: call.user.username,
          pfpUrl: undefined,
        };

        return {
          id: call.signalId, // Using signalId as the id since it's now the primary key
          signalId: call.signalId,
          fid: call.fid,
          username: user.username,
          avatar: user.pfpUrl,
          user: {
            fid: user.fid,
            username: user.username,
            pfpUrl: user.pfpUrl,
            role: (user as any).role,
            createdAt: (user as any).createdAt,
            lastActiveAt: (user as any).lastActiveAt,
          },
          tokenAddress: call.tokenAddress,
          ticker: call.ticker,
          direction: call.direction,
          timestamp: call.timestamp,
          callPrice: call.callPrice,
          transactionHash: call.transactionHash,
        };
      });
    } catch (error) {
      this.logger.error('Failed to enrich calls:', error);

      // Return calls with basic data as fallback
      return calls.map((call) => ({
        id: call.signalId, // Using signalId as the id since it's now the primary key
        signalId: call.signalId,
        fid: call.fid,
        username: call.user?.username || `user${call.fid}`,
        avatar: call.user?.pfpUrl,
        user: {
          fid: call.fid,
          username: call.user?.username || `user${call.fid}`,
          pfpUrl: call.user?.pfpUrl,
          role: (call.user as any)?.role,
          createdAt: (call.user as any)?.createdAt,
          lastActiveAt: (call.user as any)?.lastActiveAt,
        },
        tokenAddress: call.tokenAddress,
        ticker: call.ticker,
        direction: call.direction,
        timestamp: call.timestamp,
        callPrice: call.callPrice,

        transactionHash: call.transactionHash,
      }));
    }
  }

  private async checkForDuplicates(
    signalId: string,
    transactionHash: string,
  ): Promise<void> {
    const existingBySignalId = await this.callRepository.findOne({
      where: { signalId },
    });

    if (existingBySignalId) {
      throw new ConflictException('Call with this signalId already exists');
    }

    const existingByTxHash = await this.callRepository.findOne({
      where: { transactionHash },
    });

    if (existingByTxHash) {
      throw new ConflictException(
        'Call with this transactionHash already exists',
      );
    }
  }
}
