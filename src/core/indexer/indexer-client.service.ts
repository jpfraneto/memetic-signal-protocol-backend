import { Injectable, Logger } from '@nestjs/common';
import { GraphQLClient } from 'graphql-request';

export interface SignalCreatedEvent {
  id: string;
  signalId: string;
  fid: string;
  ca: string;
  direction: string;
  timeframe: string;
  expiresAt: string;
  isSubscriber: boolean;
  block_timestamp?: string;
}

export interface SignalResolvedEvent {
  id: string;
  signalId: string;
  fid: string;
  won: boolean;
  block_timestamp?: string;
}

@Injectable()
export class IndexerClientService {
  private readonly logger = new Logger(IndexerClientService.name);
  private readonly client: GraphQLClient;

  constructor() {
    this.client = new GraphQLClient('http://localhost:8080/v1/graphql');
  }

  async getRecentSignalCreatedEvents(sinceTimestamp?: string): Promise<SignalCreatedEvent[]> {
    
    const query = `
      query GetRecentSignalCreated($since: bigint) {
        ProjectLighthouseV14_SignalCreated(
          where: { 
            ${sinceTimestamp ? 'block_timestamp: { _gt: $since }' : ''}
          }
          order_by: { block_timestamp: desc }
          limit: 100
        ) {
          id
          signalId
          fid
          ca
          direction
          timeframe
          expiresAt
          isSubscriber
          block_timestamp
        }
      }
    `;

    try {
      const variables = sinceTimestamp ? { since: sinceTimestamp } : {};
      const data = await this.client.request<{ ProjectLighthouseV14_SignalCreated: SignalCreatedEvent[] }>(
        query,
        variables
      );
      
      this.logger.log(`Fetched ${data.ProjectLighthouseV14_SignalCreated.length} signal created events`);
      return data.ProjectLighthouseV14_SignalCreated;
    } catch (error) {
      this.logger.error('Failed to fetch signal created events:', error);
      return [];
    }
  }

  async getRecentSignalResolvedEvents(sinceTimestamp?: string): Promise<SignalResolvedEvent[]> {
    
    const query = `
      query GetRecentSignalResolved($since: bigint) {
        ProjectLighthouseV14_SignalResolved(
          where: { 
            ${sinceTimestamp ? 'block_timestamp: { _gt: $since }' : ''}
          }
          order_by: { block_timestamp: desc }
          limit: 100
        ) {
          id
          signalId
          fid
          won
          block_timestamp
        }
      }
    `;

    try {
      const variables = sinceTimestamp ? { since: sinceTimestamp } : {};
      const data = await this.client.request<{ ProjectLighthouseV14_SignalResolved: SignalResolvedEvent[] }>(
        query,
        variables
      );
      
      this.logger.log(`Fetched ${data.ProjectLighthouseV14_SignalResolved.length} signal resolved events`);
      return data.ProjectLighthouseV14_SignalResolved;
    } catch (error) {
      this.logger.error('Failed to fetch signal resolved events:', error);
      return [];
    }
  }

  async getSignalByContractId(signalId: string): Promise<SignalCreatedEvent | null> {
    
    const query = `
      query GetSignalById($signalId: bigint!) {
        ProjectLighthouseV14_SignalCreated(
          where: { signalId: { _eq: $signalId } }
          limit: 1
        ) {
          id
          signalId
          fid
          ca
          direction
          timeframe
          expiresAt
          isSubscriber
          block_timestamp
        }
      }
    `;

    try {
      const data = await this.client.request<{ ProjectLighthouseV14_SignalCreated: SignalCreatedEvent[] }>(
        query,
        { signalId }
      );
      
      return data.ProjectLighthouseV14_SignalCreated[0] || null;
    } catch (error) {
      this.logger.error(`Failed to fetch signal ${signalId}:`, error);
      return null;
    }
  }
}