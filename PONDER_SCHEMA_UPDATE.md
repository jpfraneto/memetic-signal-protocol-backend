# Ponder Schema Update for Historical Data Tracking

You need to add the following fields to your Ponder schema to track the fallback data resolution:

## Update signals table

Add these fields to the `signals` table in your Ponder schema:

```javascript
export const signals = onchainTable("signals", (t) => ({
  signal_id: t.integer().notNull().primaryKey(),
  transaction_hash: t.hex().notNull(),
  fid: t.integer().notNull(),
  ca: t.hex().notNull(),
  direction: t.boolean().notNull(),
  duration_days: t.integer().notNull(),
  entry_market_cap: t.bigint().notNull(),
  created_at: t.bigint().notNull(),
  expires_at: t.bigint().notNull(),
  timestamp: t.date().notNull(),
  block_number: t.bigint().notNull(),
  resolved: t.boolean().notNull().default(false),
  mfs_delta: t.integer().default(0),
  manually_updated: t.boolean().notNull().default(false),
  
  // NEW FIELDS FOR HISTORICAL DATA TRACKING
  exit_market_cap: t.bigint(), // Market cap at resolution time
  exit_market_cap_source: t.text(), // Source: "CoinGecko", "CoinMarketCap", "CryptoCompare", "CoinAPI", "DexScreener"
  resolution_attempts: t.text(), // JSON array of attempted sources: ["CoinGecko", "CoinMarketCap"]
  resolved_at: t.date(), // Timestamp when signal was resolved (helpful for analytics)
}));
```

## Create historical_data_failures table (Optional)

For better tracking of API failures, you might want to add a new table:

```javascript
export const historical_data_failures = onchainTable("historical_data_failures", (t) => ({
  id: t.text().primaryKey(), // UUID
  signal_id: t.integer().notNull(),
  contract_address: t.hex().notNull(),
  timestamp_requested: t.date().notNull(),
  provider_name: t.text().notNull(), // "CoinGecko", "CoinMarketCap", etc.
  error_message: t.text().notNull(),
  error_code: t.text(), // HTTP status code or API error code
  retry_count: t.integer().default(0),
  created_at: t.date().notNull(),
}));
```

## Relations Update

Add relations for the new failure tracking table:

```javascript
export const historicalDataFailuresRelations = relations(
  historical_data_failures,
  ({ one }) => ({
    signal: one(signals, {
      fields: [historical_data_failures.signal_id],
      references: [signals.signal_id],
    }),
  })
);

// Update signals relations to include failures
export const signalsRelations = relations(signals, ({ one, many }) => ({
  user: one(users, { fields: [signals.fid], references: [users.fid] }),
  token: one(tokens, { fields: [signals.ca], references: [tokens.ca] }),
  historical_data_failures: many(historical_data_failures), // NEW
}));
```

## Benefits of These Changes

1. **Transparency**: Track which data source was used for each signal resolution
2. **Reliability Metrics**: Analyze which providers work best for different tokens
3. **Debugging**: Understand why certain signals failed to resolve
4. **Cost Optimization**: Track API usage across providers
5. **Compliance**: Audit trail for data source attribution

## Migration Notes

- These are **nullable fields** so existing signals won't break
- The backend will populate these fields going forward
- You can backfill some data by running resolution analysis on existing signals

## Example Usage

After resolution, signals will have:
```json
{
  "signal_id": 123,
  "exit_market_cap": "1500000000",
  "exit_market_cap_source": "CoinMarketCap", 
  "resolution_attempts": "[\"CoinGecko\", \"CoinMarketCap\"]",
  "resolved_at": "2024-01-15T10:30:00Z"
}
```