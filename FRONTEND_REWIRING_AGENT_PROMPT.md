# Frontend Agent: Complete Miniapp Rewiring for New /auth-service/me Endpoint

## Mission Statement
You are tasked with **completely rewiring** the Memetic Signal Protocol frontend miniapp to use the new comprehensive `/auth-service/me` endpoint. This single API call now provides ALL data needed for the entire miniapp, replacing multiple separate API endpoints with one optimized request.

## Critical Context: The Game-Changing Backend Update

### What Changed
The backend team has implemented a revolutionary **single-source-of-truth endpoint** that consolidates:
- **User Profile & Stats** (previously separate API calls)
- **Signal Feed with Price Data** (previously multiple endpoints)  
- **Trending Tokens for Signal Creation** (previously separate Zapper calls)
- **Complete Leaderboard Data** (previously multiple leaderboard endpoints)

### Performance Benefits
- **Response Time**: <800ms (was previously 2-4 seconds for all data)
- **API Calls**: 1 request (was previously 5+ separate calls)
- **Data Consistency**: Single atomic response (no more race conditions)
- **Error Handling**: Comprehensive structured errors with fallbacks
- **Caching**: Advanced Redis caching with component-specific TTLs

## Your Mission: Complete Frontend Overhaul

### Phase 1: API Layer Transformation

#### Remove Old API Calls
**Delete or deprecate these existing API endpoints:**
```typescript
// OLD ENDPOINTS TO REMOVE/REPLACE:
- GET /user/profile
- GET /user/stats  
- GET /signals/feed
- GET /signals/recent
- GET /tokens/trending
- GET /tokens/featured
- GET /leaderboards/top-scorers
- GET /leaderboards/most-signals
- GET /leaderboards/champion
- Any other profile/feed/leaderboard related calls
```

#### Implement New Single API Call
**Create new API service:**
```typescript
// NEW: Single comprehensive API call
interface MiniappApiService {
  async getMiniappData(): Promise<MeEndpointResponse> {
    const response = await fetch('/auth-service/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${farcasterJWT}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new MiniappApiError(error);
    }

    return await response.json();
  }
}
```

### Phase 2: Data Structure Integration

#### Complete TypeScript Interface Implementation
```typescript
// IMPLEMENT THESE EXACT INTERFACES IN YOUR FRONTEND:

interface MeEndpointResponse {
  success: true;
  user: UserProfile;
  feedData: FeedData;
  featuredTokens: FeaturedToken[];
  leaderboards: Leaderboards;
}

interface UserProfile {
  fid: number;
  username: string;
  displayName: string | null;
  pfpUrl: string | null;
  totalScore: number;          // Total accumulated points
  totalSignals: number;        // Total signals created
  activeSignals: number;       // Currently pending signals
  rank: number | null;         // Global leaderboard position
  winRate: number;             // Win percentage (0-100)
  isVerified: boolean;         // Farcaster verification
  followerCount: number;       // Farcaster followers
  followingCount: number;      // Farcaster following
}

interface FeedData {
  signals: SignalFeedItem[];
  totalCount: number;
}

interface SignalFeedItem {
  id: string;                  // Signal ID
  fid: number;                 // Creator FID
  username: string;            // Creator username
  displayName: string | null;  // Creator display name
  pfpUrl: string | null;       // Creator avatar
  ca: string;                  // Token contract address
  tokenName: string;           // Token name
  tokenSymbol: string;         // Token symbol
  tokenImage: string;          // Token logo URL
  direction: boolean;          // true=UP, false=DOWN
  duration: number;            // Duration in seconds
  timestamp: bigint;           // Creation timestamp
  status: number;              // 0=ACTIVE, 1=WON, 2=LOST
  expiresAt: bigint;           // Expiration timestamp
  initialMarketCap: number | null;  // Market cap when created
  currentMarketCap: number | null;  // Current market cap
  priceChange: number | null;       // Price change percentage
  transactionHash: string;     // Blockchain tx hash
  blockNumber: bigint;         // Block number
}

interface FeaturedToken {
  tokenAddress: string;        // Contract address
  chainId: number;             // Chain ID
  token: {
    name: string;              // Token name
    symbol: string;            // Token symbol
    imageUrlV2: string;        // Token image
    decimals: number;          // Token decimals
    priceData: {
      price: number;           // Current USD price
      priceChange24h: number;  // 24h change %
      volume24h: number;       // 24h volume
      marketCap: number;       // Market cap
    };
  };
}

interface Leaderboards {
  topByScore: LeaderboardUser[];    // Top 3 by score
  mostSignals: LeaderboardUser[];   // Top 3 by signals
  champion: LeaderboardUser | null; // Overall champion
}

interface LeaderboardUser {
  fid: number;
  username: string;
  displayName: string | null;
  pfpUrl: string | null;
  totalScore?: number;         // For score leaderboards
  totalSignals?: number;       // For signal leaderboards  
  winRate?: number;            // For champion only
}
```

### Phase 3: Screen-Specific Implementation

#### Feed Screen Overhaul
```typescript
// TRANSFORM FEED SCREEN TO USE NEW DATA:
function FeedScreen({ data }: { data: MeEndpointResponse }) {
  const feedItems = data.feedData.signals.map(signal => ({
    id: signal.id,
    creator: {
      fid: signal.fid,
      username: signal.username,
      displayName: signal.displayName,
      avatar: signal.pfpUrl
    },
    token: {
      address: signal.ca,
      name: signal.tokenName,
      symbol: signal.tokenSymbol,
      image: signal.tokenImage,
      // NEW: Price data now included!
      initialMarketCap: signal.initialMarketCap,
      currentMarketCap: signal.currentMarketCap,
      priceChange: signal.priceChange
    },
    signal: {
      direction: signal.direction ? 'UP' : 'DOWN',
      duration: signal.duration,
      createdAt: Number(signal.timestamp),
      expiresAt: Number(signal.expiresAt),
      status: ['ACTIVE', 'WON', 'LOST'][signal.status],
      // NEW: Blockchain data included!
      transactionHash: signal.transactionHash,
      blockNumber: Number(signal.blockNumber)
    }
  }));

  return (
    <FeedContainer>
      <FeedStats totalSignals={data.feedData.totalCount} />
      {feedItems.map(item => (
        <SignalFeedCard 
          key={item.id} 
          {...item}
          // NEW: Can show price change indicators!
          showPriceChange={true}
        />
      ))}
    </FeedContainer>
  );
}
```

#### Signal Creation Screen Enhancement  
```typescript
// ENHANCE SIGNAL CREATION WITH TRENDING TOKENS:
function SignalCreationScreen({ data }: { data: MeEndpointResponse }) {
  const trendingTokens = data.featuredTokens.map(token => ({
    address: token.tokenAddress,
    chainId: token.chainId,
    name: token.token.name,
    symbol: token.token.symbol,
    image: token.token.imageUrlV2,
    // NEW: Live price data for better UX!
    price: token.token.priceData.price,
    priceChange24h: token.token.priceData.priceChange24h,
    volume24h: token.token.priceData.volume24h,
    marketCap: token.token.priceData.marketCap,
    decimals: token.token.decimals
  }));

  // NEW: User's current signal limits from profile
  const userLimits = {
    totalSignals: data.user.totalSignals,
    activeSignals: data.user.activeSignals,
    canCreateSignal: data.user.activeSignals < MAX_ACTIVE_SIGNALS
  };

  return (
    <SignalCreationContainer>
      <UserSignalLimits {...userLimits} />
      <TrendingTokensSection 
        tokens={trendingTokens}
        showPriceData={true}  // NEW: Show live prices!
      />
      <SignalForm userFid={data.user.fid} />
    </SignalCreationContainer>
  );
}
```

#### Leaderboard Screen Complete Redesign
```typescript
// COMPLETE LEADERBOARD REDESIGN WITH ALL DATA:
function LeaderboardScreen({ data }: { data: MeEndpointResponse }) {
  const { topByScore, mostSignals, champion } = data.leaderboards;
  const currentUser = data.user;

  return (
    <LeaderboardContainer>
      {/* NEW: Champion Section */}
      {champion && (
        <ChampionSection>
          <ChampionCard
            fid={champion.fid}
            username={champion.username}
            displayName={champion.displayName}
            avatar={champion.pfpUrl}
            score={champion.totalScore}
            signals={champion.totalSignals}
            winRate={champion.winRate}
          />
        </ChampionSection>
      )}

      {/* Current User Stats */}
      <UserStatsSection>
        <UserStatsCard
          rank={currentUser.rank}
          score={currentUser.totalScore}
          signals={currentUser.totalSignals}
          winRate={currentUser.winRate}
        />
      </UserStatsSection>

      {/* Leaderboard Tabs */}
      <LeaderboardTabs>
        <TabPanel label="Top Scorers">
          {topByScore.map((user, index) => (
            <LeaderboardItem
              key={user.fid}
              rank={index + 1}
              fid={user.fid}
              username={user.username}
              displayName={user.displayName}
              avatar={user.pfpUrl}
              value={user.totalScore}
              metric="score"
            />
          ))}
        </TabPanel>
        
        <TabPanel label="Most Active">
          {mostSignals.map((user, index) => (
            <LeaderboardItem
              key={user.fid}
              rank={index + 1}
              fid={user.fid}
              username={user.username}
              displayName={user.displayName}
              avatar={user.pfpUrl}
              value={user.totalSignals}
              metric="signals"
            />
          ))}
        </TabPanel>
      </LeaderboardTabs>
    </LeaderboardContainer>
  );
}
```

### Phase 4: State Management Overhaul

#### Centralized State with Single API Call
```typescript
// IMPLEMENT CENTRALIZED STATE MANAGEMENT:
interface AppState {
  miniappData: MeEndpointResponse | null;
  loading: boolean;
  error: MiniappError | null;
  lastFetch: number;
}

// NEW: Single data fetching hook
function useMiniappData() {
  const [state, setState] = useState<AppState>({
    miniappData: null,
    loading: false,
    error: null,
    lastFetch: 0
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const data = await miniappApi.getMiniappData();
      setState({
        miniappData: data,
        loading: false,
        error: null,
        lastFetch: Date.now()
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error as MiniappError
      }));
    }
  }, []);

  // Auto-refresh every 2 minutes for feed updates
  useEffect(() => {
    const interval = setInterval(fetchData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}
```

### Phase 5: Error Handling Revolution

#### Comprehensive Error Management
```typescript
// IMPLEMENT ADVANCED ERROR HANDLING:
class MiniappApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public details: string,
    public component: string,
    public retryable: boolean
  ) {
    super(message);
  }
}

function useErrorHandler() {
  const showError = useCallback((error: MiniappApiError) => {
    switch (error.code) {
      case 'NEYNAR_API_UNAVAILABLE':
        showToast({
          type: 'warning',
          title: 'Profile data may be outdated',
          message: 'Farcaster profile service is temporarily unavailable',
          action: error.retryable ? 'Retry' : undefined
        });
        break;

      case 'ZAPPER_API_TIMEOUT':
        showToast({
          type: 'info', 
          title: 'Trending tokens unavailable',
          message: 'Token recommendations are temporarily unavailable',
          action: 'Continue anyway'
        });
        break;

      case 'DATABASE_CONNECTION_FAILED':
        showToast({
          type: 'error',
          title: 'Connection issue',
          message: 'Please try again in a few moments',
          action: 'Retry'
        });
        break;

      case 'REDIS_CACHE_UNAVAILABLE':
        // Silent degradation - just slower responses
        console.warn('Cache unavailable, using direct database');
        break;

      default:
        showToast({
          type: 'error',
          title: 'Something went wrong',
          message: 'Please refresh the app and try again',
          action: 'Refresh'
        });
    }
  }, []);

  return { showError };
}
```

### Phase 6: Performance & Caching

#### Frontend Caching Strategy
```typescript
// IMPLEMENT FRONTEND CACHING TO COMPLEMENT BACKEND:
function useCachedMiniappData() {
  const [cachedData, setCachedData] = useState<MeEndpointResponse | null>(
    () => {
      // Load from localStorage on init
      const cached = localStorage.getItem('miniapp_data');
      return cached ? JSON.parse(cached) : null;
    }
  );

  const fetchWithCache = useCallback(async () => {
    try {
      const data = await miniappApi.getMiniappData();
      
      // Cache successful responses
      setCachedData(data);
      localStorage.setItem('miniapp_data', JSON.stringify(data));
      
      return data;
    } catch (error) {
      // Use cached data on failure
      if (cachedData) {
        console.warn('API failed, using cached data:', error);
        return cachedData;
      }
      throw error;
    }
  }, [cachedData]);

  return { cachedData, fetchWithCache };
}
```

### Phase 7: Real-Time Updates

#### Smart Refresh Strategy
```typescript
// IMPLEMENT SMART REFRESH BASED ON COMPONENT CACHE TTLS:
function useSmartRefresh() {
  const { miniappData, refetch } = useMiniappData();
  
  useEffect(() => {
    // Different refresh intervals based on data sensitivity:
    
    // Feed data: Refresh every 2 minutes (matches backend cache)
    const feedRefresh = setInterval(() => {
      console.log('Refreshing feed data...');
      refetch();
    }, 2 * 60 * 1000);

    // User stats: Refresh every 30 minutes
    const userRefresh = setInterval(() => {
      console.log('Refreshing user data...');
      refetch();
    }, 30 * 60 * 1000);

    // Leaderboards: Refresh every 10 minutes
    const leaderboardRefresh = setInterval(() => {
      console.log('Refreshing leaderboard data...');
      refetch();
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(feedRefresh);
      clearInterval(userRefresh);  
      clearInterval(leaderboardRefresh);
    };
  }, [refetch]);
}
```

## Critical Implementation Requirements

### 1. Complete Migration Checklist
- [ ] Remove ALL old API endpoint calls
- [ ] Implement new `MeEndpointResponse` TypeScript interfaces
- [ ] Update Feed screen to use `data.feedData.signals`
- [ ] Update Signal Creation to use `data.featuredTokens`  
- [ ] Completely redesign Leaderboard with `data.leaderboards`
- [ ] Implement centralized state with single API call
- [ ] Add comprehensive error handling for all error codes
- [ ] Implement frontend caching with localStorage backup
- [ ] Add smart refresh intervals matching backend cache TTLs
- [ ] Update all components to use new data structure

### 2. Data Validation & Type Safety
```typescript
// IMPLEMENT RUNTIME VALIDATION:
function validateMiniappResponse(data: any): data is MeEndpointResponse {
  return (
    data &&
    typeof data.success === 'boolean' &&
    data.user &&
    typeof data.user.fid === 'number' &&
    data.feedData &&
    Array.isArray(data.feedData.signals) &&
    data.featuredTokens &&
    Array.isArray(data.featuredTokens) &&
    data.leaderboards &&
    Array.isArray(data.leaderboards.topByScore)
  );
}
```

### 3. Loading States & Skeleton UI
```typescript
// IMPLEMENT SOPHISTICATED LOADING STATES:
function LoadingStates() {
  return {
    // Initial app load
    initialLoad: <FullScreenSpinner />,
    
    // Refresh states for each section
    userRefresh: <UserCardSkeleton />,
    feedRefresh: <FeedItemSkeleton count={5} />,
    tokensRefresh: <TokenCardSkeleton count={8} />,
    leaderboardRefresh: <LeaderboardSkeleton />
  };
}
```

### 4. Offline Support
```typescript
// IMPLEMENT OFFLINE CAPABILITIES:
function useOfflineSupport() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    showOfflineBanner: !isOnline,
    useOfflineData: !isOnline
  };
}
```

## Success Criteria

### Performance Targets
- **Initial Load**: <2 seconds (was 4-6 seconds)
- **Screen Transitions**: Instant (data already loaded)
- **Error Recovery**: <1 second fallback to cached data
- **Network Requests**: 1 per session (was 5+ per screen)

### User Experience Goals
- **Seamless Navigation**: All data available immediately
- **Real-Time Price Data**: Live market caps on signals
- **Comprehensive Leaderboards**: Full champion and rankings view
- **Robust Error Handling**: Graceful degradation with helpful messages
- **Offline Support**: Continue using cached data when offline

### Technical Quality
- **Type Safety**: 100% TypeScript coverage with runtime validation
- **Error Boundaries**: Catch and handle all component failures
- **Performance Monitoring**: Log all API response times
- **Cache Efficiency**: Minimize redundant API calls

## Final Notes

This is a **complete architectural overhaul** of your frontend data layer. The new `/auth-service/me` endpoint represents a paradigm shift from multiple fragmented API calls to a single, comprehensive data source.

**Key Benefits You're Implementing:**
1. **Dramatic Performance Improvement** - Sub-second screen transitions
2. **Data Consistency** - No more race conditions between API calls
3. **Simplified State Management** - Single source of truth
4. **Enhanced Error Handling** - Graceful degradation and helpful error messages
5. **Better Offline Experience** - Cached data available when network fails

**Your mission is to leverage this powerful new endpoint to create the fastest, most reliable miniapp experience possible.** The backend team has done the heavy lifting on optimization, caching, and error handling - now bring that same level of excellence to the frontend implementation.

Transform the entire user experience by implementing this single API call architecture! 🚀