import {
  Controller,
  Get,
  Query,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import {
  FeedService,
  FeedResponse,
  EnrichedSignal,
  FeedFilters,
} from './feed.service';
import { Signal } from 'src/models/Signal/Signal.model';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  private readonly logger = new Logger(FeedController.name);

  constructor(private feedService: FeedService) {}

  @Get()
  @ApiOperation({ summary: 'Get enriched signals feed' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated enriched signals',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiQuery({
    name: 'fid',
    required: false,
    type: String,
    description: 'Filter by Farcaster ID',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    type: Number,
    description: 'Filter by direction (0=DOWN, 1=UP)',
  })
  @ApiQuery({
    name: 'isResolved',
    required: false,
    type: Boolean,
    description: 'Filter by resolution status',
  })
  @ApiQuery({
    name: 'tokenAddress',
    required: false,
    type: String,
    description: 'Filter by token contract address',
  })
  @ApiQuery({
    name: 'minTimeframe',
    required: false,
    type: Number,
    description: 'Minimum timeframe (0-100)',
  })
  @ApiQuery({
    name: 'maxTimeframe',
    required: false,
    type: Number,
    description: 'Maximum timeframe (0-100)',
  })
  async getFeed(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('fid') fid?: string,
    @Query('direction', new DefaultValuePipe(undefined)) direction?: number,
    @Query('isResolved') isResolved?: boolean,
    @Query('ca') ca?: string,
    @Query('minTimeframe') minTimeframe?: number,
    @Query('maxTimeframe') maxTimeframe?: number,
  ): Promise<FeedResponse> {
    const filters: FeedFilters = {
      page,
      limit: Math.min(limit, 100), // Cap at 100 items per page
      fid,
      direction,
      isResolved,
      ca,
      minTimeframe,
      maxTimeframe,
    };

    return this.feedService.getEnrichedFeed(filters);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent signals' })
  @ApiResponse({ status: 200, description: 'Returns recent signals' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of signals (default: 20)',
  })
  async getRecentSignals(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<Signal[]> {
    return this.feedService.getRecentSignals(Math.min(limit, 100));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get feed statistics' })
  @ApiResponse({ status: 200, description: 'Returns feed statistics' })
  async getFeedStats() {
    const [feedStats] = await Promise.all([this.feedService.getFeedStats()]);

    return {
      ...feedStats,
    };
  }

  @Get('token/:ca')
  @ApiOperation({ summary: 'Get signals for a specific token' })
  @ApiResponse({ status: 200, description: 'Returns signals for the token' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of signals (default: 10)',
  })
  async getSignalsByToken(
    @Param('ca') ca: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<Signal[]> {
    return this.feedService.getSignalsByToken(ca, Math.min(limit, 100));
  }

  @Get('fid/:fid')
  @ApiOperation({ summary: 'Get signals for a specific Farcaster ID' })
  @ApiResponse({ status: 200, description: 'Returns signals for the FID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of signals (default: 20)',
  })
  async getSignalsByFid(
    @Param('fid') fid: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<Signal[]> {
    return this.feedService.getSignalsByFid(fid, Math.min(limit, 100));
  }

  @Get('signal/:signalId')
  @ApiOperation({ summary: 'Get a specific signal by ID' })
  @ApiResponse({ status: 200, description: 'Returns the signal' })
  async getSignalById(
    @Param('signalId') signalId: string,
  ): Promise<Signal | null> {
    return this.feedService.getSignalById(signalId);
  }
}
