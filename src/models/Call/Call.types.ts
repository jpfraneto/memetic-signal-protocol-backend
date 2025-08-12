export interface CallMetadata {
  userAgent?: string;
  clientFid?: number;
  source?: 'miniapp' | 'frame' | 'api';
}

export type CallDirection = 'up' | 'down';
export type CallStatus = 'active' | 'won' | 'lost' | 'expired';
export type CallTimeframe = '24h' | '7d' | '30d';

export interface CreateCallData {
  signalId: string;
  transactionHash: string;
  fid: number;
  tokenAddress: string;
  username: string;
  ticker: string;
  direction: CallDirection;
  timestamp: number;
  callPrice?: number;
  currentPrice?: number;
  timeframe?: CallTimeframe;
  status?: CallStatus;
  expiresAt?: Date;
  pnlPercentage?: number;
  metadata?: CallMetadata;
}
