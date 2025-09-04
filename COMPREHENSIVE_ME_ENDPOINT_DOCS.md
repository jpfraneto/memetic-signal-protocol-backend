# Complete /auth-service/me Endpoint Documentation

## Executive Summary

The `/auth-service/me` endpoint is the **single source of truth** for all Memetic Signal Protocol miniapp data. This endpoint replaces multiple API calls with one optimized request, providing complete data for Feed, Signal Creation, and Leaderboard screens in under 800ms.

## Endpoint Specification

### Base Information

- **URL**: `GET /auth-service/me`
- **Authentication**: Required - Farcaster QuickAuth JWT in Authorization header
- **Content-Type**: `application/json`
- **Target Response Time**: <800ms
- **Cache Strategy**: Multi-level Redis with component-specific TTLs

### Request Format

```bash
curl -X GET "http://localhost:3000/auth-service/me" \
  -H "Authorization: Bearer <FARCASTER_JWT_TOKEN>" \
  -H "Accept: application/json"
```

## Complete Response Schema

### Success Response (HTTP 200)

```typescript
interface MeEndpointResponse {
  success: true;
  user: UserProfile;
  feedData: FeedData;
  featuredTokens: FeaturedToken[];
  leaderboards: Leaderboards;
}

interface UserProfile {
  fid: number; // User's Farcaster ID
  username: string; // Farcaster username
  displayName: string | null; // Display name from Farcaster
  pfpUrl: string | null; // Profile picture URL
  totalScore: number; // Accumulated points from resolved signals
  totalSignals: number; // Total number of signals created
  activeSignals: number; // Currently active/pending signals
  rank: number | null; // Global leaderboard position
  winRate: number; // Win percentage (0-100)
  isVerified: boolean; // Farcaster verification status
  followerCount: number; // Farcaster follower count
  followingCount: number; // Farcaster following count
}

interface FeedData {
  signals: SignalFeedItem[]; // Array of recent signals
  totalCount: number; // Total signals in system
}

interface SignalFeedItem {
  id: string; // Signal ID (hex format)
  fid: number; // Signal creator's FID
  username: string; // Signal creator's username
  displayName: string | null; // Signal creator's display name
  pfpUrl: string | null; // Signal creator's profile picture
  ca: string; // Token contract address
  tokenName: string; // Token name
  tokenSymbol: string; // Token symbol (e.g., "ETH")
  tokenImage: string; // Token logo URL
  direction: boolean; // true = UP signal, false = DOWN signal
  duration: number; // Signal duration in seconds
  timestamp: bigint; // Signal creation timestamp
  status: number; // 0=ACTIVE, 1=WON, 2=LOST
  expiresAt: bigint; // Signal expiration timestamp
  mc: number | null; // Market cap when signal created
  currentMarketCap: number | null; // Current market cap
  priceChange: number | null; // Price change percentage
  transactionHash: string; // Blockchain transaction hash
  blockNumber: bigint; // Block number
}

interface FeaturedToken {
  tokenAddress: string; // Contract address
  chainId: number; // Blockchain chain ID
  token: {
    name: string; // Token name
    symbol: string; // Token symbol
    imageUrlV2: string; // Token image URL
    decimals: number; // Token decimals
    priceData: {
      price: number; // Current USD price
      priceChange24h: number; // 24h price change %
      volume24h: number; // 24h trading volume
      marketCap: number; // Market capitalization
    };
  };
}

interface Leaderboards {
  topByScore: LeaderboardUser[]; // Top 3 users by total score
  mostSignals: LeaderboardUser[]; // Top 3 users by signal count
  champion: LeaderboardUser | null; // Overall champion (highest score)
}

interface LeaderboardUser {
  fid: number; // User FID
  username: string; // Username
  displayName: string | null; // Display name
  pfpUrl: string | null; // Profile picture
  totalScore?: number; // Total score (for score leaderboards)
  totalSignals?: number; // Total signals (for signal leaderboards)
  winRate?: number; // Win rate (for champion only)
}
```

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string; // Specific error code
    message: string; // User-friendly message
    details: string; // Technical details
    timestamp: string; // ISO timestamp
    fid: number | null; // User FID if available
    component: string; // Failed component
    retryable: boolean; // Whether user should retry
  };
}
```

## Error Codes and Handling

### Authentication Errors (HTTP 400-401)

```typescript
// Invalid FID
{
  success: false,
  error: {
    code: "INVALID_FID",
    message: "Invalid user identifier provided",
    details: "FID must be a positive integer from Farcaster authentication",
    component: "AUTH_VALIDATION",
    retryable: false
  }
}
```

### Service Unavailable Errors (HTTP 503)

```typescript
// Neynar API Down
{
  success: false,
  error: {
    code: "NEYNAR_API_UNAVAILABLE",
    message: "Failed to fetch user profile from Farcaster",
    details: "Neynar API is currently unavailable. User profile data may be outdated.",
    component: "NEYNAR_INTEGRATION",
    retryable: true
  }
}

// Zapper API Timeout
{
  success: false,
  error: {
    code: "ZAPPER_API_TIMEOUT",
    message: "Trending tokens service unavailable",
    details: "Unable to fetch trending tokens. Other features should work normally.",
    component: "ZAPPER_API",
    retryable: true
  }
}

// Redis Cache Down
{
  success: false,
  error: {
    code: "REDIS_CACHE_UNAVAILABLE",
    message: "Cache service unavailable",
    details: "Redis cache is unavailable. Data will be served directly from database.",
    component: "CACHE",
    retryable: true
  }
}
```

### Database Errors (HTTP 500)

```typescript
// Database Connection Failed
{
  success: false,
  error: {
    code: "DATABASE_CONNECTION_FAILED",
    message: "Database connection error",
    details: "Unable to connect to the database. Please try again in a few moments.",
    component: "DATABASE",
    retryable: true
  }
}
```

### Rate Limiting (HTTP 429)

```typescript
// CoinGecko Rate Limit
{
  success: false,
  error: {
    code: "COINGECKO_RATE_LIMIT",
    message: "Price data rate limit exceeded",
    details: "Token price data temporarily unavailable due to rate limits.",
    component: "PRICE_DATA",
    retryable: true
  }
}
```

## Frontend Integration Guide

### Data Flow Architecture

```typescript
// Single API call replaces multiple endpoints
// OLD WAY (5+ separate API calls):
// - GET /user/profile
// - GET /signals/feed
// - GET /tokens/trending
// - GET /leaderboards/top-scorers
// - GET /leaderboards/most-signals

// NEW WAY (1 optimized API call):
const response = await fetch('/auth-service/me', {
  headers: { Authorization: `Bearer ${farcasterJWT}` },
});
const data = await response.json();

// All data now available in single response:
// - data.user           -> User profile and stats
// - data.feedData       -> Signal feed with price data
// - data.featuredTokens -> Trending tokens for signal creation
// - data.leaderboards   -> All leaderboard data
```

### Screen-Specific Data Mapping

#### Feed Screen Data

```typescript
// Signal Feed Items
data.feedData.signals.forEach((signal) => {
  const feedItem = {
    id: signal.id,
    creator: {
      fid: signal.fid,
      username: signal.username,
      displayName: signal.displayName,
      avatar: signal.pfpUrl,
    },
    token: {
      address: signal.ca,
      name: signal.tokenName,
      symbol: signal.tokenSymbol,
      image: signal.tokenImage,
      initialMarketCap: signal.initialMarketCap,
      currentMarketCap: signal.currentMarketCap,
      priceChange: signal.priceChange,
    },
    signal: {
      direction: signal.direction ? 'UP' : 'DOWN',
      duration: signal.duration,
      createdAt: Number(signal.timestamp),
      expiresAt: Number(signal.expires_at),
      status: ['ACTIVE', 'WON', 'LOST'][signal.status],
    },
    blockchain: {
      transactionHash: signal.transactionHash,
      blockNumber: Number(signal.blockNumber),
    },
  };
});
```

#### Signal Creation Screen Data

```typescript
// Featured/Trending Tokens for Signal Creation
data.featuredTokens.forEach((token) => {
  const tokenOption = {
    address: token.tokenAddress,
    chainId: token.chainId,
    name: token.token.name,
    symbol: token.token.symbol,
    image: token.token.imageUrlV2,
    price: token.token.priceData.price,
    priceChange24h: token.token.priceData.priceChange24h,
    volume24h: token.token.priceData.volume24h,
    marketCap: token.token.priceData.marketCap,
    decimals: token.token.decimals,
  };
});
```

#### Leaderboard Screen Data

```typescript
// Top Scorers Leaderboard
const topScorers = data.leaderboards.topByScore.map((user, index) => ({
  rank: index + 1,
  fid: user.fid,
  username: user.username,
  displayName: user.displayName,
  avatar: user.pfpUrl,
  score: user.totalScore,
}));

// Most Active Signalers
const mostActive = data.leaderboards.mostSignals.map((user, index) => ({
  rank: index + 1,
  fid: user.fid,
  username: user.username,
  displayName: user.displayName,
  avatar: user.pfpUrl,
  signals: user.totalSignals,
}));

// Overall Champion
const champion = data.leaderboards.champion
  ? {
      fid: data.leaderboards.champion.fid,
      username: data.leaderboards.champion.username,
      displayName: data.leaderboards.champion.displayName,
      avatar: data.leaderboards.champion.pfpUrl,
      score: data.leaderboards.champion.totalScore,
      signals: data.leaderboards.champion.totalSignals,
      winRate: data.leaderboards.champion.winRate,
    }
  : null;
```

#### User Profile Data

```typescript
// Current User Profile and Stats
const userProfile = {
  fid: data.user.fid,
  username: data.user.username,
  displayName: data.user.displayName,
  avatar: data.user.pfpUrl,
  stats: {
    totalScore: data.user.totalScore,
    totalSignals: data.user.totalSignals,
    activeSignals: data.user.activeSignals,
    rank: data.user.rank,
    winRate: data.user.winRate,
  },
  social: {
    isVerified: data.user.isVerified,
    followers: data.user.followerCount,
    following: data.user.followingCount,
  },
};
```

## Caching and Performance

### Cache Strategy

- **User Profile**: 30 minutes TTL with Neynar refresh
- **Feed Data**: 2 minutes TTL with real-time updates
- **Leaderboards**: 10 minutes TTL with batch updates
- **Trending Tokens**: 5 minutes TTL with Zapper refresh
- **Price Snapshots**: 5 minutes TTL per token

### Performance Monitoring

The endpoint logs detailed metrics for monitoring:

```typescript
interface PerformanceMetrics {
  totalDuration: number; // Total response time
  userSuccess: boolean; // User data fetch success
  feedSuccess: boolean; // Feed data fetch success
  tokensSuccess: boolean; // Trending tokens success
  leaderboardSuccess: boolean; // Leaderboard data success
  cacheHitRatio: number; // Percentage of cache hits
  databaseQueryTime: number; // DB query execution time
  externalApiTime: number; // External API response time
}
```

## Migration from Multiple Endpoints

### Before (Multiple API Calls)

```typescript
// OLD: Multiple API calls on app load
const [user, feed, tokens, leaderboards] = await Promise.all([
  fetch('/user/profile'),
  fetch('/signals/feed?limit=50'),
  fetch('/tokens/trending?limit=8'),
  fetch('/leaderboards/all'),
]);
```

### After (Single API Call)

```typescript
// NEW: Single comprehensive API call
const response = await fetch('/auth-service/me');
const data = await response.json();

// All data available immediately:
// - User profile and stats
// - Complete signal feed with price data
// - Trending tokens for signal creation
// - All leaderboard data
```

## Error Handling Best Practices

### Frontend Error Handling

```typescript
async function fetchMiniappData() {
  try {
    const response = await fetch('/auth-service/me', {
      headers: { Authorization: `Bearer ${farcasterJWT}` },
    });

    if (!response.ok) {
      const error = await response.json();

      // Handle specific error types
      switch (error.error.code) {
        case 'NEYNAR_API_UNAVAILABLE':
          showToast('Profile data may be outdated', 'warning');
          break;
        case 'ZAPPER_API_TIMEOUT':
          showToast('Trending tokens unavailable', 'info');
          break;
        case 'DATABASE_CONNECTION_FAILED':
          showToast('Please try again in a few moments', 'error');
          break;
        default:
          showToast('Something went wrong. Please refresh.', 'error');
      }

      // Use cached data if available
      return getCachedData() || getEmptyState();
    }

    const data = await response.json();

    // Cache successful response
    setCachedData(data);

    return data;
  } catch (networkError) {
    console.error('Network error:', networkError);
    showToast('Connection failed. Using offline data.', 'error');
    return getCachedData() || getEmptyState();
  }
}
```

### Graceful Degradation

```typescript
// Handle partial data scenarios
function processApiResponse(data) {
  return {
    user: data.user || getDefaultUser(),
    feedData: data.feedData || { signals: [], totalCount: 0 },
    featuredTokens: data.featuredTokens || [],
    leaderboards: data.leaderboards || {
      topByScore: [],
      mostSignals: [],
      champion: null,
    },
  };
}
```

This comprehensive endpoint replaces the need for multiple API calls and provides a single, reliable source of truth for all miniapp data with robust error handling and performance optimization.
