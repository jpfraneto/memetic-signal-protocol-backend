# Blockchain Integration - Project Lighthouse V3

This document outlines how the backend integrates with your smart contract deployed on Base mainnet at `0xdeB0E09366048944aC9033d5517Bf4Dcc39f2C97`.

## Architecture Overview

The backend now features a **hybrid architecture** that combines the benefits of both blockchain immutability and traditional database performance:

### 🔗 Blockchain Layer (Source of Truth)
- **ProjectLighthouseV3 Contract** on Base mainnet
- Immutable record of all predictions and settlements
- Auto-calculated MFS scores and user statistics
- Event-driven updates for real-time sync

### 💾 Database Layer (Performance Cache)
- Fast queries for user interfaces
- Pagination and filtering support
- Real-time price updates for active calls
- Optimized for frontend data consumption

## Key Components

### 1. BlockchainService (`/src/core/blockchain/blockchain.service.ts`)

**Core Functions:**
- **Event Listening:** Real-time sync of contract events
- **Data Sync:** Periodic synchronization of contract state to database
- **Settlement Operations:** Batch settlement of expired signals on-chain
- **Price Integration:** CoinGecko price fetching for settlement

**Key Methods:**
```typescript
// Sync single signal from blockchain to database
syncSignalFromBlockchain(signalId: number): Promise<Call | null>

// Batch settle expired signals on blockchain
batchSettleSignalsOnBlockchain(settlements): Promise<boolean>

// Get expired signals from contract
getExpiredSignalsFromBlockchain(maxResults): Promise<number[]>

// Real-time event listening
startEventListening(): void
```

### 2. Enhanced Signal Scheduler (`/src/core/signal/signal-scheduler.service.ts`)

**Automated Jobs:**
- **Every 5 minutes:** Check and settle expired signals on blockchain
- **Every 10 minutes:** Fallback database settlement (if blockchain fails)
- **Every hour:** Sync missing signals from blockchain to database
- **Every 30 minutes:** Clean up token price cache

**Manual Triggers:** (Admin endpoints)
- `/admin-service/blockchain/settle` - Trigger blockchain settlement
- `/admin-service/blockchain/sync` - Trigger blockchain sync
- `/admin-service/blockchain/stats` - Get contract statistics

### 3. Smart Contract Integration

**Contract Functions Used:**
```solidity
// Reading data
getSignal(uint256 signalId) - Get signal details
getUserSignals(uint256 fid) - Get user's signal IDs
getUserStats(uint256 fid) - Get user statistics and MFS score
getExpiredSignals(uint256 maxResults) - Get expired signal IDs

// Writing data (requires private key)
settleSignal(uint256 signalId, uint256 exitPrice) - Settle single signal
batchSettleSignals(uint256[] signalIds, uint256[] exitPrices) - Batch settle
```

**Events Monitored:**
```solidity
SignalCreated - New prediction made
SignalSettled - Prediction resolved
MFSUpdated - User score recalculated
```

## Environment Configuration

Add these variables to your `.env` file:

```bash
# Base Network Configuration
BASE_RPC_URL=https://mainnet.base.org
BLOCKCHAIN_PRIVATE_KEY=your_private_key_here

# Contract is already configured in the code
CONTRACT_ADDRESS=0xdeB0E09366048944aC9033d5517Bf4Dcc39f2C97
```

**⚠️ Security Note:** The private key is only needed if you want the backend to automatically settle signals. For read-only operations, you can omit the private key.

## Data Flow

### 1. Signal Creation (Frontend → Blockchain → Backend)
```
Frontend → Smart Contract (makeCall) → Event Emitted → Backend Syncs
```

### 2. Signal Settlement (Backend → Blockchain → Backend)
```
Cron Job → Fetch Expired → Get Prices → Batch Settle → Sync Results
```

### 3. Real-time Updates
```
Contract Events → Event Listeners → Database Updates → User Stats Refresh
```

## API Endpoints

### Blockchain Admin Endpoints (Admin Only)

**POST** `/admin-service/blockchain/settle`
- Manually trigger blockchain settlement of expired signals
- Fetches current prices and batch settles on-chain

**POST** `/admin-service/blockchain/sync` 
- Manually sync missing signals from blockchain to database
- Useful after system downtime or initial setup

**GET** `/admin-service/blockchain/stats`
- Get contract statistics (total signals, active, settled, next ID)
- Monitor blockchain vs database sync status

### Enhanced User Endpoints

All existing endpoints now show data sourced from the blockchain but served with database performance:

**GET** `/signal-service/feed` - Signal feed with real blockchain data
**GET** `/leaderboard-service` - Rankings based on blockchain MFS scores  
**GET** `/users-service/{fid}` - User stats synced from blockchain

## Smart Contract Features

Your ProjectLighthouseV3 contract provides several advanced features:

### 1. **Timeframe-Based Predictions**
- 24 hours, 7 days, or 30 days
- Automatic expiration tracking
- Precise P&L calculation using entry/exit prices

### 2. **MFS Score Calculation**
- Win rate (40% weight)
- Consistency (20% weight) 
- Recent performance (30% weight)
- Risk-adjusted returns (10% weight)
- Minimum 5 settled calls required

### 3. **Batch Operations**
- Efficient gas usage through batch settlement
- Reduced transaction costs for large-scale operations

### 4. **Event-Driven Architecture**
- Real-time updates via event emissions
- Transparent on-chain history
- Immutable prediction records

## Monitoring & Maintenance

### Health Checks
- **Database Sync Status:** Compare latest signal IDs
- **Settlement Lag:** Monitor time between expiration and settlement
- **Event Processing:** Track event listener health

### Performance Optimization
- **Batch Size Limits:** Process max 50 signals per settlement batch
- **Rate Limiting:** Respect CoinGecko API limits
- **Cache Management:** 5-minute price caching, 1-hour token info

### Error Handling
- **Fallback Settlement:** Database-only if blockchain fails
- **Price Failures:** Mark signals as 'expired' if no price data
- **Network Issues:** Retry logic with exponential backoff

## Benefits of This Architecture

### ✅ **For Users**
- **Transparency:** All predictions permanently recorded on-chain
- **Trust:** Immutable settlement and scoring
- **Performance:** Fast API responses from database cache

### ✅ **For Platform**
- **Scalability:** Database handles high-frequency queries
- **Reliability:** Blockchain provides authoritative state
- **Cost Efficiency:** Batch operations reduce gas costs

### ✅ **For Development** 
- **Flexibility:** Can enhance database features without changing blockchain
- **Auditability:** Complete on-chain history for compliance
- **Recovery:** Can rebuild database from blockchain events

## Getting Started

1. **Deploy & Configure:**
   ```bash
   cp .env.example .env
   # Add your BASE_RPC_URL and BLOCKCHAIN_PRIVATE_KEY
   ```

2. **Initial Sync:**
   ```bash
   npm run start
   # POST /admin-service/blockchain/sync (to sync existing signals)
   ```

3. **Enable Real-time Sync:**
   - Event listeners start automatically
   - Cron jobs begin after startup
   - Monitor logs for sync status

4. **Test Settlement:**
   ```bash
   # POST /admin-service/blockchain/settle
   # Check logs for settlement results
   ```

The system is now fully integrated with your Base mainnet smart contract and ready for production use! 🚀