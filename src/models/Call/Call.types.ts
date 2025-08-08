export interface CallMetadata {
  userAgent?: string;
  clientFid?: number;
  source?: 'miniapp' | 'frame' | 'api';
}

export type CallDirection = 'up' | 'down';

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
  metadata?: CallMetadata;
}
