export type SignalDirection = 'UP' | 'DOWN';
export type SignalStatus = 'ACTIVE' | 'WON' | 'LOST' | 'EXPIRED';

export interface TokenPrediction {
  ca: string;
  ticker: string;
  mc: string;
  direction: SignalDirection;
}

export interface CreateSignalData {
  signalId: string;
  fid: number;
  tokenAddress: string;
  tokenTicker: string;
  initialMarketCap: string;
  direction: SignalDirection;
  expiresAt: Date;
}
