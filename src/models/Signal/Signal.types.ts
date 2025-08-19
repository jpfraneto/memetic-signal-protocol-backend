export type SignalDirection = 'UP' | 'DOWN';
export type SignalStatus = 'ACTIVE' | 'WON' | 'LOST' | 'EXPIRED';

export interface TokenPrediction {
  ca: string;              // Contract address
  ticker: string;          // Token symbol
  mc: string;             // Market cap at signal time (scaled by 1e18)
  prizeInUSDC: string;    // Prize amount in USDC (future feature)
  tokenImageUrl: string;  // Token image URL
  direction: SignalDirection; // UP or DOWN prediction
}

export interface DefaultToken {
  ca: string;     // Contract address
  ticker: string; // Token symbol
}

export interface SignalMetadata {
  userAgent?: string;
  source?: 'miniapp' | 'frame' | 'api';
  sessionStartTime?: number;
  isRetry?: boolean;
}

export interface CreateSignalData {
  signalId: string;
  fid: number;
  tokens: TokenPrediction[];
  expiresAt: Date;
  metadata?: SignalMetadata;
}