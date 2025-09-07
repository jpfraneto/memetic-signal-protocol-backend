# Signal Resolution System

This document describes the signal resolution system that automatically settles expired signals on the smart contract.

## Overview

The signal resolution system consists of several components that work together to:

1. **Monitor expired signals** - Find signals that have passed their expiration time
2. **Fetch current market data** - Get the latest market cap for tokens
3. **Calculate MFS deltas** - Compute the Memetic Footprint Score impact
4. **Batch resolve on-chain** - Submit resolution transactions to the smart contract
5. **Update user statistics** - Recalculate user scores and rankings

## Architecture

### Core Services

- **`SignalResolutionService`** - Main orchestrator that runs every 30 minutes
- **`BlockchainService`** - Handles smart contract interactions
- **`MFSService`** - Calculates MFS deltas using exponential decay formula
- **`TokenPriceService`** - Fetches current market cap data

### Database Schema (Ponder Managed)

The system works with the Ponder-managed database schema:

```typescript
signals: {
  signal_id: number (PRIMARY KEY)
  transaction_hash: string
  fid: number
  ca: string (token contract address)
  direction: boolean (UP/DOWN)
  duration_days: number
  created_at: bigint (timestamp)
  expires_at: bigint (timestamp) 
  resolved: boolean
  mfs_applied: string (int256 as string)
  status: number (0=active, 1=won, 2=lost)
  mc: number (market cap at signal creation)
}
```

## Environment Variables

Add these environment variables to enable signal resolution:

### Required Variables

```bash
# Backend wallet private key (must be set as resolver on contract)
PRIVATE_KEY=0x...

# Smart contract address
CONTRACT_ADDRESS=0x...

# Base RPC URL for blockchain interactions  
BASE_RPC_URL=https://mainnet.base.org

# CoinGecko Pro API key for price data
COINGECKO_API_KEY=your_api_key_here
```

### Optional Variables

```bash
# MFS decay constant (default: 0.888)
MSP_DECAY_CONSTANT=0.888

# Enable/disable notifications (default: true)
NOTIFICATIONS_ENABLED=true
```

## How It Works

### 1. Cron Schedule
The system runs every 30 minutes at `:00` and `:30` minutes of each hour.

### 2. Signal Discovery
```sql
SELECT * FROM signals 
WHERE resolved = false 
AND expires_at < CURRENT_TIMESTAMP
ORDER BY expires_at ASC
LIMIT 50
```

### 3. MFS Calculation
For each expired signal:

```typescript
// Determine if prediction was correct
isCorrect = (direction === 'UP' && currentMC > entryMC) || 
            (direction === 'DOWN' && currentMC < entryMC)

// Calculate MFS delta  
marketCapChange = currentMC - entryMC
directionMultiplier = isCorrect ? 1 : -1
decayMultiplier = Math.exp(-0.888 * (durationDays - 1))
mfsDelta = marketCapChange * directionMultiplier * decayMultiplier
```

### 4. Batch Resolution
All signals in a batch are resolved atomically on the smart contract:

```solidity
function batchResolveSignals(
    uint256[] calldata signalIds,
    int256[] calldata mfsDeltas
) external
```

### 5. Database Updates
- Mark signals as `resolved = true`
- Update user statistics (win rate, MFS score)
- Send notifications to users

## Testing & Monitoring

### Manual Trigger
```bash
curl -X POST http://localhost:8080/signal-service/admin/trigger-resolution
```

### View Statistics  
```bash
curl http://localhost:8080/signal-service/admin/resolution-stats
```

### Logs
Monitor logs for resolution activity:
```bash
# Look for these log patterns
"Starting 30-minute signal resolution cycle..."
"Found N expired signals to resolve"  
"Batch resolved N signals successfully"
"Blockchain resolution successful. Tx: 0x..."
```

## Error Handling

The system includes robust error handling:

- **Retry Logic** - Up to 3 attempts with exponential backoff
- **Partial Failures** - Individual signal errors don't stop the batch
- **Fallback States** - Signals marked as LOST if blockchain calls fail
- **Price Data Failures** - Signals skipped if market cap unavailable

## Security Considerations

- Backend wallet must be set as `resolver` on the smart contract
- Only the resolver can call `resolveSignal()` and `batchResolveSignals()`  
- All transactions are signed by the backend's private key
- MFS deltas are calculated off-chain but applied on-chain for transparency

## Performance

- **Batch Size**: 50 signals per run (configurable)
- **Frequency**: Every 30 minutes
- **API Limits**: Respects CoinGecko rate limits (1.2s between requests)
- **Caching**: Price data cached for 5 minutes, metadata for 24 hours

## Troubleshooting

### Common Issues

1. **"Backend wallet is not authorized as contract resolver"**
   - Ensure `PRIVATE_KEY` wallet is set as resolver on contract
   - Check contract owner has called `setResolver(backendAddress)`

2. **"Could not fetch price for token"**
   - Verify `COINGECKO_API_KEY` is valid and has quota remaining
   - Check token is listed on CoinGecko or DexScreener  

3. **"No expired signals found"**  
   - Normal if no signals have expired recently
   - Check database has signals with `resolved = false`

### Health Checks

The system provides health information via:
- Resolution statistics endpoint
- Application logs  
- Database signal counts
- Smart contract event logs

## Development

To add new features or modify the resolution logic:

1. **MFS Calculation**: Edit `src/core/mfs/mfs.service.ts`
2. **Blockchain Interaction**: Edit `src/core/blockchain/blockchain.service.ts`  
3. **Scheduling**: Edit `src/core/signal/signal-resolution.service.ts`
4. **Price Data**: Edit `src/core/signal/services/token-price.service.ts`

Always test changes thoroughly on a testnet before deploying to production.