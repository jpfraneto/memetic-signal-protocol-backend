export interface HistoricalDataPoint {
  price: number;
  marketCap: number;
  timestamp: number;
}

export interface HistoricalDataProvider {
  name: string;
  fetchHistoricalData(
    contractAddress: string,
    timestamp: Date,
  ): Promise<HistoricalDataPoint | null>;
}

export interface TokenMetadata {
  symbol: string;
  name: string;
  coinId?: string;
  coinGeckoId?: string;
  coinMarketCapId?: number;
}

export interface TokenLookupProvider {
  lookupToken(contractAddress: string): Promise<TokenMetadata | null>;
}