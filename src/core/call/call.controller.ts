import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpStatus,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

import { CallService } from './services';
import { CreateCallDto } from './dto/create-call.dto';
import { GetCallsQueryDto } from './dto/get-calls-query.dto';
import { CallResponseDto, CallsFeedResponseDto } from './dto/call-response.dto';
import { hasError } from '../../utils';

@ApiTags('call-service')
@Controller('call-service')
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('calls')
  @ApiOperation({
    summary: 'Save call data after successful blockchain processing',
  })
  @ApiResponse({ status: 201, description: 'Call data saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate signalId or transactionHash',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createCall(@Body() createCallDto: CreateCallDto, @Res() res: Response) {
    try {
      const call = await this.callService.createCall(createCallDto);

      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: call,
      });
    } catch (error) {
      console.error('❌ [CallController] Error creating call:', error);

      if (error.status === 409) {
        return hasError(res, HttpStatus.CONFLICT, 'createCall', error.message);
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'createCall',
        'Failed to save call data',
      );
    }
  }

  @Get('calls')
  @ApiOperation({ summary: 'Fetch paginated call feed' })
  @ApiResponse({
    status: 200,
    description:
      'Paginated list of calls with user profiles and current prices',
    type: CallsFeedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCalls(@Query() query: GetCallsQueryDto, @Res() res: Response) {
    try {
      const result = await this.callService.getCalls(query);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('❌ [CallController] Error fetching calls:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCalls',
        'Failed to fetch calls',
      );
    }
  }

  @Get('calls/:signalId')
  @ApiOperation({ summary: 'Get specific call details by signal ID' })
  @ApiResponse({
    status: 200,
    description: 'Call details with user profile and current price',
    type: CallResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Call not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCallBySignalId(
    @Param('signalId') signalId: string,
    @Res() res: Response,
  ) {
    try {
      const call = await this.callService.getCallBySignalId(signalId);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: call,
      });
    } catch (error) {
      console.error(
        '❌ [CallController] Error fetching call by signalId:',
        error,
      );

      if (error.status === 404) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getCallBySignalId',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCallBySignalId',
        'Failed to fetch call details',
      );
    }
  }
}
