export interface TokenMetadata {
  coingeckoId?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
}

export interface TokenPriceData {
  usd: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  last_updated_at?: number;
}