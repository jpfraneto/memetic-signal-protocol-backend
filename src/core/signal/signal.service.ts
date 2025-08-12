import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Call } from '../../models/Call/Call.model';
import { User } from '../../models/User/User.model';
import { TokenPriceService } from '../call/services/token-price.service';
import { CreateSignalDto } from './dto/create-signal.dto';
import { GetSignalsFeedDto } from './dto/get-signals-feed.dto';

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);

  constructor(
    @InjectRepository(Call)
    private callRepository: Repository<Call>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tokenPriceService: TokenPriceService,
  ) {}

  async createSignal(createSignalDto: CreateSignalDto): Promise<any> {
    try {
      // Get or create user
      let user = await this.userRepository.findOne({
        where: { fid: createSignalDto.fid },
      });

      if (!user) {
        user = this.userRepository.create({
          fid: createSignalDto.fid,
          username: createSignalDto.username,
        });
        await this.userRepository.save(user);
      }

      // Get current token price if not provided
      let entryPrice = createSignalDto.entryPrice;
      if (!entryPrice) {
        entryPrice = await this.tokenPriceService.getTokenPrice(
          createSignalDto.tokenAddress,
        );
        if (!entryPrice) {
          throw new HttpException(
            'Unable to fetch token price',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Calculate expiration time
      const now = new Date();
      const expiresAt = new Date(now);

      switch (createSignalDto.timeframe) {
        case '24h':
          expiresAt.setHours(expiresAt.getHours() + 24);
          break;
        case '7d':
          expiresAt.setDate(expiresAt.getDate() + 7);
          break;
        case '30d':
          expiresAt.setDate(expiresAt.getDate() + 30);
          break;
      }

      // Generate unique signal ID
      const signalId = `signal-${Date.now()}-${createSignalDto.fid}`;

      // Create call record
      const call = this.callRepository.create({
        signalId,
        transactionHash: createSignalDto.txHash,
        tokenAddress: createSignalDto.tokenAddress,
        ticker: createSignalDto.tokenSymbol,
        direction: createSignalDto.direction,
        timestamp: Date.now(),
        callPrice: entryPrice,
        timeframe: createSignalDto.timeframe,
        status: 'active',
        expiresAt,
        fid: user.fid,
        user: user,
      });

      const savedCall = await this.callRepository.save(call);

      // Update user stats
      await this.updateUserStats(user.fid, 'add_active');

      return {
        id: savedCall.signalId,
        fid: user.fid,
        username: user.username,
        tokenAddress: savedCall.tokenAddress,
        tokenSymbol: savedCall.ticker,
        direction: savedCall.direction,
        entryPrice: savedCall.callPrice,
        currentPrice: null,
        timeframe: savedCall.timeframe,
        status: savedCall.status,
        createdAt: savedCall.createdAt,
        expiresAt: savedCall.expiresAt,
        pnlPercentage: null,
        txHash: savedCall.transactionHash,
      };
    } catch (error) {
      this.logger.error('Error creating signal:', error);
      throw error;
    }
  }

  async getSignalsFeed(query: GetSignalsFeedDto): Promise<any> {
    try {
      this.logger.debug('Fetching signals feed with find options');
      console.log('the query is ', query);

      // Build find options
      const findOptions: any = {
        relations: ['user'],

        skip: (query.page - 1) * query.limit,
        take: query.limit,
      };
      console.log('the find options are ', findOptions);

      // Build where conditions
      const where: any = {};
      if (query.status) {
        where.status = query.status;
      }

      if (Object.keys(where).length > 0) {
        findOptions.where = where;
      }

      this.logger.debug(
        'Executing find with options:',
        JSON.stringify(findOptions),
      );
      const [calls, total] =
        await this.callRepository.findAndCount(findOptions);
      this.logger.debug(
        `Query executed successfully, found ${total} total records`,
      );

      // Update current prices for active calls
      const activeCalls = calls.filter((call) => call.status === 'active');
      if (activeCalls.length > 0) {
        const tokenAddresses = [
          ...new Set(activeCalls.map((call) => call.tokenAddress)),
        ];
        const priceMap =
          await this.tokenPriceService.getTokenPrices(tokenAddresses);

        for (const call of activeCalls) {
          const currentPrice = priceMap.get(call.tokenAddress.toLowerCase());
          if (currentPrice) {
            call.currentPrice = currentPrice;
            call.pnlPercentage = this.tokenPriceService.calculatePnL(
              call.callPrice,
              currentPrice,
              call.direction,
            );
          }
        }
      }

      const signals = calls.map((call) => ({
        id: call.signalId,
        tokenAddress: call.tokenAddress,
        tokenSymbol: call.ticker,
        direction: call.direction,
        entryPrice: call.callPrice,
        currentPrice: call.currentPrice,
        timeframe: call.timeframe,
        status: call.status,
        createdAt: call.createdAt,
        expiresAt: call.expiresAt,
        pnlPercentage: call.pnlPercentage,
        txHash: call.transactionHash,
        user: call.user,
      }));

      return {
        signals,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching signals feed:', error);
      throw new HttpException(
        'Failed to fetch signals',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getSignalById(signalId: string): Promise<any> {
    try {
      const call = await this.callRepository.findOne({
        where: { signalId },
        relations: ['user'],
      });

      if (!call) {
        throw new HttpException('Signal not found', HttpStatus.NOT_FOUND);
      }

      // Update current price if active
      if (call.status === 'active') {
        const currentPrice = await this.tokenPriceService.getTokenPrice(
          call.tokenAddress,
        );
        if (currentPrice) {
          call.currentPrice = currentPrice;
          call.pnlPercentage = this.tokenPriceService.calculatePnL(
            call.callPrice,
            currentPrice,
            call.direction,
          );
        }
      }

      return {
        id: call.signalId,
        fid: call.user.fid,
        username: call.user.username,
        tokenAddress: call.tokenAddress,
        tokenSymbol: call.ticker,
        direction: call.direction,
        entryPrice: call.callPrice,
        currentPrice: call.currentPrice,
        timeframe: call.timeframe,
        status: call.status,
        createdAt: call.createdAt,
        expiresAt: call.expiresAt,
        pnlPercentage: call.pnlPercentage,
        txHash: call.transactionHash,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Error fetching signal by ID:', error);
      throw new HttpException(
        'Failed to fetch signal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async settleSignal(signalId: string): Promise<any> {
    try {
      const call = await this.callRepository.findOne({
        where: { signalId },
        relations: ['user'],
      });

      if (!call) {
        throw new HttpException('Signal not found', HttpStatus.NOT_FOUND);
      }

      if (call.status !== 'active') {
        throw new HttpException('Signal already settled', HttpStatus.CONFLICT);
      }

      // Get current price
      const currentPrice = await this.tokenPriceService.getTokenPrice(
        call.tokenAddress,
      );
      if (!currentPrice) {
        throw new HttpException(
          'Unable to fetch current price for settlement',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Calculate result
      const pnlPercentage = this.tokenPriceService.calculatePnL(
        call.callPrice,
        currentPrice,
        call.direction,
      );

      const isWin = pnlPercentage > 0;
      const newStatus = isWin ? 'won' : 'lost';

      // Update call
      call.currentPrice = currentPrice;
      call.pnlPercentage = pnlPercentage;
      call.status = newStatus;

      await this.callRepository.save(call);

      // Update user stats
      await this.updateUserStats(call.user.fid, 'settle', isWin);

      return {
        id: call.signalId,
        status: call.status,
        pnlPercentage: call.pnlPercentage,
        currentPrice: call.currentPrice,
        settled: true,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Error settling signal:', error);
      throw new HttpException(
        'Failed to settle signal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async updateUserStats(
    fid: number,
    action: string,
    isWin?: boolean,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { fid } });
      if (!user) return;

      switch (action) {
        case 'add_active':
          user.activeCalls += 1;
          user.totalCalls += 1;
          break;
        case 'settle':
          user.activeCalls = Math.max(0, user.activeCalls - 1);
          user.settledCalls += 1;
          if (isWin) {
            // Update win rate
            const totalSettled = user.settledCalls;
            const previousWins = Math.round(
              (user.winRate / 100) * (totalSettled - 1),
            );
            const newWins = previousWins + 1;
            user.winRate = (newWins / totalSettled) * 100;
          } else {
            // Update win rate for loss
            const totalSettled = user.settledCalls;
            const previousWins = Math.round(
              (user.winRate / 100) * (totalSettled - 1),
            );
            user.winRate = (previousWins / totalSettled) * 100;
          }
          break;
      }

      // Calculate MFS Score (0-1 scale based on win rate and settled calls)
      if (user.settledCalls >= 5) {
        const winRateWeight = user.winRate / 100;
        const volumeWeight = Math.min(user.settledCalls / 100, 1); // Cap at 100 calls
        user.mfsScore = winRateWeight * 0.7 + volumeWeight * 0.3;
      }

      await this.userRepository.save(user);
    } catch (error) {
      this.logger.error('Error updating user stats:', error);
    }
  }
}
