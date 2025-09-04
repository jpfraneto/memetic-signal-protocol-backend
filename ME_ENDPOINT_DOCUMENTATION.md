# /auth-service/me Endpoint Documentation

## Overview
The `/auth-service/me` endpoint is the **primary entry point** for the entire Memetic Signal Protocol miniapp. This single endpoint returns ALL data required to populate the three main screens: Feed, Signal Creation, and Leaderboards.

## Implementation Details

### Key Features Implemented
✅ **Comprehensive Data Retrieval** - Returns user profile, feed signals, trending tokens, and leaderboards in one request  
✅ **Advanced Redis Caching** - Multi-level caching with TTL management (user: 30min, feed: 2min, leaderboards: 10min)  
✅ **Performance Optimization** - Target <800ms response time with parallel data fetching and optimized SQL queries  
✅ **Robust Error Handling** - Structured error responses with actionable error codes  
✅ **Fallback Strategies** - Graceful degradation when external APIs fail  
✅ **Database Resilience** - Connection retry and simplified query fallbacks  
✅ **Neynar Integration** - Automatic user profile updates from Farcaster  
✅ **Price Data Integration** - Live token market cap and price changes  

### Response Structure
```typescript
interface MeEndpointResponse {
  success: boolean;
  user: UserProfileDto;           // Complete user stats and profile
  feedData: FeedDataDto;          // 50 latest signals with price data
  featuredTokens: FeaturedTokenDto[]; // 8 trending tokens from Zapper
  leaderboards: LeaderboardsDto;   // Top scorers, most signals, champion
}
```

### Caching Strategy
- **User Data**: 30-minute TTL with stale-while-revalidate from Neynar
- **Feed Data**: 2-minute TTL with simplified query fallback
- **Leaderboards**: 10-minute TTL with cached fallback
- **Trending Tokens**: 5-minute TTL with global cache fallback
- **Price Snapshots**: 5-minute TTL per token address

### Error Handling
Comprehensive error codes with structured responses:
- `NEYNAR_API_UNAVAILABLE` - Farcaster profile service down
- `DATABASE_CONNECTION_FAILED` - PostgreSQL connection issues
- `REDIS_CACHE_UNAVAILABLE` - Redis cache service down
- `ZAPPER_API_TIMEOUT` - Trending tokens service unavailable
- `COINGECKO_RATE_LIMIT` - Price data rate limit exceeded
- `USER_NOT_FOUND` - Invalid FID provided
- `INVALID_FID` - Malformed request

### Database Queries
Optimized SQL with proper joins and price snapshots:
```sql
-- Primary feed query with price data
SELECT 
  s.id, s.fid, s.ca, s.direction, s.duration,
  s.timestamp, s.status, s.expires_at,
  u.username, u.display_name, u.pfp_url,
  t.name, t.symbol, t.image,
  ps_initial.market_cap as initial_market_cap,
  ps_current.market_cap as current_market_cap
FROM signals s
LEFT JOIN users u ON s.fid = u.fid
LEFT JOIN tokens t ON LOWER(s.ca) = LOWER(t.ca)
LEFT JOIN price_snapshots ps_initial ON (...)
LEFT JOIN price_snapshots ps_current ON (...)
ORDER BY s.timestamp DESC
LIMIT 50;
```

### Performance Metrics
- **Target Response Time**: <800ms
- **Database Queries**: <300ms total
- **External API Calls**: <400ms total
- **Cache Operations**: <50ms total
- **Concurrent Support**: 100+ simultaneous requests

### Files Created/Modified

#### New Files
- `src/core/auth/dto/me-endpoint-response.dto.ts` - Complete response type definitions
- `src/core/auth/services/me-endpoint.service.ts` - Core business logic with caching and fallbacks

#### Modified Files
- `src/core/auth/auth.controller.ts` - Updated GET /me endpoint with comprehensive error handling
- `src/core/auth/auth.module.ts` - Added new service and repository dependencies
- `src/core/auth/services/index.ts` - Added new service export

### API Documentation
Added comprehensive Swagger documentation with:
- Operation details and performance targets
- Request/response schemas
- All possible error codes and status codes
- Authentication requirements

### Usage Example
```bash
curl -H "Authorization: Bearer <farcaster-jwt>" \
     http://localhost:3000/auth-service/me
```

## Architecture Benefits

### Scalability
- Parallel data fetching reduces response time
- Redis caching reduces database load
- Fallback strategies prevent complete failures

### Reliability
- Multiple fallback layers for each data source
- Graceful degradation when services are unavailable
- Structured error responses for better debugging

### Performance
- Multi-level caching strategy
- Optimized SQL queries with proper indexing
- Async parallel processing

### Maintainability
- Clear separation of concerns
- Comprehensive error handling
- Extensive logging for debugging

## Monitoring & Debugging
The endpoint logs detailed performance metrics including:
- Total response time
- Individual component success/failure rates
- Cache hit/miss ratios
- External API response times
- Database query execution times

This enables easy identification of performance bottlenecks and service issues.