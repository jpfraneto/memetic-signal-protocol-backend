# Indexer Sync Implementation

This implementation provides real-time synchronization between your backend and the Envio GraphQL indexer for Project Lighthouse V14 smart contract events.

## Architecture Overview

```
Smart Contract → Envio Indexer → GraphQL API → Backend Sync Service → Enriched Feed
     ↓               ↓               ↓              ↓                    ↓
Signal Created   Event Storage   HTTP/GraphQL   Local Cache +      Token Metadata +
Signal Resolved                                 Polling         Blockchain Signals
```

## Key Components

### 1. BlockchainSignal Entity (`src/models/BlockchainSignal/`)
- Stores blockchain signal events with token relationships
- Tracks sync status and resolution state
- Links to your existing Token metadata

### 2. IndexerClientService (`src/core/indexer/indexer-client.service.ts`)
- GraphQL client for querying the Envio indexer
- Fetches `SignalCreated` and `SignalResolved` events
- Handles pagination and filtering by timestamp

### 3. SignalSyncService (`src/core/indexer/signal-sync.service.ts`)
- Scheduled service that polls indexer every minute
- Maintains last sync timestamp for incremental updates
- Enriches signals with token metadata from your database

### 4. FeedService (`src/core/feed/feed.service.ts`)
- Provides enriched feed combining blockchain signals + token metadata
- Supports filtering by FID, token, direction, timeframe, resolution status
- Optimized for fast feed serving with pagination

### 5. FeedController (`src/core/feed/feed.controller.ts`)
- REST API endpoints for accessing enriched feed data
- Admin endpoint for manual sync triggering

## API Endpoints

### Main Feed
- `GET /feed` - Paginated enriched signals feed with filtering
- `GET /feed/recent` - Latest signals (default: 20)
- `GET /feed/active` - Unresolved signals
- `GET /feed/stats` - Feed and sync statistics

### Specific Queries
- `GET /feed/token/:address` - Signals for specific token
- `GET /feed/fid/:fid` - Signals for specific Farcaster ID
- `GET /feed/signal/:signalId` - Get specific signal

### Admin
- `GET /feed/sync/force` - Manually trigger sync

## Example Usage

```typescript
// Get recent signals with token metadata
const recentSignals = await feedService.getRecentSignals(10);

// Get paginated feed with filters
const feed = await feedService.getEnrichedFeed({
  page: 1,
  limit: 20,
  direction: 1, // UP signals only
  isResolved: false, // Active signals only
});

// Get signals for specific token
const tokenSignals = await feedService.getSignalsByToken('0x123...', 5);
```

## Sync Strategy

1. **Polling**: Every minute via `@Cron` decorator
2. **Incremental**: Only fetches events newer than `lastSyncTimestamp`
3. **Resilient**: Continues on individual event failures
4. **Enriched**: Automatically links token metadata when available

## Data Flow

1. User creates signal on smart contract
2. Envio indexer captures `SignalCreated` event
3. Sync service polls indexer and finds new event
4. Event saved to `blockchain_signals` table with token metadata
5. Feed API serves enriched data combining blockchain events + token metadata
6. When signal resolves, `SignalResolved` event updates the signal status

## Configuration

The sync service automatically:
- Initializes `lastSyncTimestamp` from latest signal in database
- Handles missing token metadata gracefully
- Provides detailed logging for monitoring
- Exposes statistics for observability

## Monitoring

Check sync health via:
- `GET /feed/stats` - Returns sync status and statistics
- Application logs - Detailed sync operation logging
- Database - `blockchain_signals.syncedAt` shows last update times

## Performance

- **Caching**: Signals stored locally for fast feed serving
- **Pagination**: Efficient database queries with proper indexing
- **Batching**: Processes up to 100 events per sync cycle
- **Indexing**: Recommend adding indexes on frequently queried fields:
  ```sql
  CREATE INDEX idx_blockchain_signals_fid ON blockchain_signals(fid);
  CREATE INDEX idx_blockchain_signals_ca ON blockchain_signals(ca);
  CREATE INDEX idx_blockchain_signals_created_at ON blockchain_signals(createdAt);
  CREATE INDEX idx_blockchain_signals_is_resolved ON blockchain_signals(isResolved);
  ```

This implementation provides a robust foundation for serving real-time, enriched signal data to your users while maintaining separation between blockchain events and your application's token metadata.