# Frontend AI Agent Prompt for Crypto Prediction Platform

You need to implement a frontend application for a crypto prediction platform where users make token price calls. Your backend API is already implemented and running. Here are the key requirements and available endpoints:

## Backend API Endpoints Available

### 1. Signal/Call Management

- `POST /signal-service/signal` - Create new prediction call
- `GET /signal-service/feed` - Get signal feed with pagination
- `GET /signal-service/{signalId}` - Get specific signal details
- `PUT /signal-service/{signalId}/settle` - Manually settle expired signal

### 2. Token Price & Metadata

- `GET /tokens-service/price/{contractAddress}` - Get token price
- `GET /tokens-service/info/{contractAddress}` - Get token metadata
- `GET /tokens-service/prices?addresses=addr1,addr2` - Get multiple token prices

### 3. User Management

- `GET /users-service/{fid}` - Get user's call history and profile
- `GET /users-service/{fid}/calls` - Get user's calls with pagination

### 4. Leaderboard

- `GET /leaderboard-service` - Top performers ranked by MFS score
- `GET /leaderboard-service/stats` - Overall leaderboard statistics

## Data Models

### SignalCall Interface

```typescript
interface SignalCall {
  id: string;
  fid: number; // Farcaster ID
  username: string;
  tokenAddress: string;
  tokenSymbol: string;
  direction: 'up' | 'down';
  entryPrice: number;
  currentPrice?: number;
  timeframe: '24h' | '7d' | '30d';
  status: 'active' | 'won' | 'lost' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  pnlPercentage?: number;
  txHash: string; // Blockchain transaction hash
}
```

### UserStats Interface

```typescript
interface UserStats {
  fid: number;
  username: string;
  pfpUrl?: string;
  isVerified: boolean;
  totalCalls: number;
  activeCalls: number;
  settledCalls: number;
  winRate: number; // Percentage
  mfsScore: number; // 0-1 scale (Memetic Footprint Score)
  rank?: number;
}
```

## Frontend Implementation Requirements

### Core Features to Build:

1. **Signal Feed Page**
   - Display paginated list of all prediction calls
   - Show user profiles, token info, entry prices, current P&L
   - Real-time price updates for active calls
   - Filter by status (active, won, lost), timeframe, user
   - Sort by creation date, P&L percentage

2. **Create Signal Form**
   - Token address input with validation
   - Direction selection (up/down)
   - Timeframe selection (24h, 7d, 30d)
   - Token price display and confirmation
   - Transaction hash input after blockchain interaction

3. **User Profile Page**
   - User stats and performance metrics
   - User's call history with pagination
   - Win rate and MFS score display
   - Active vs settled calls breakdown

4. **Leaderboard Page**
   - Top performers ranked by MFS score
   - Minimum 5 settled calls to appear
   - User rankings with win rates and call volume
   - Overall platform statistics

5. **Token Search & Info**
   - Token search by contract address
   - Display token metadata (name, symbol, image, market cap)
   - Current price display with caching

### Technical Specifications:

**API Integration:**

- All API responses follow this format:

```json
{
  "success": true,
  "data": {
    /* response data */
  }
}
```

**Error Handling:**

- Handle network errors gracefully
- Show user-friendly error messages
- Implement retry logic for failed requests

**Real-time Updates:**

- Update active call prices every 30 seconds
- Show loading states during API calls
- Cache token prices to reduce API calls

**Pagination:**

- All list endpoints support `page` and `limit` parameters
- Default: page=1, limit=20
- Show pagination controls

**Responsive Design:**

- Mobile-first approach
- Cards/grid layout for signals
- Collapsible filters on mobile

### Key API Call Examples:

**Get Signal Feed:**

```typescript
const getSignalsFeed = async (filters: {
  page?: number;
  limit?: number;
  status?: 'active' | 'won' | 'lost' | 'expired';
  timeframe?: '24h' | '7d' | '30d';
  fid?: number;
}) => {
  const params = new URLSearchParams(filters);
  const response = await fetch(`/signal-service/feed?${params}`);
  return response.json();
};
```

**Get Token Price:**

```typescript
const getTokenPrice = async (contractAddress: string) => {
  const response = await fetch(`/tokens-service/price/${contractAddress}`);
  return response.json();
};
```

**Get Leaderboard:**

```typescript
const getLeaderboard = async (page: number = 1, limit: number = 20) => {
  const response = await fetch(
    `/leaderboard-service?page=${page}&limit=${limit}`,
  );
  return response.json();
};
```

### UI/UX Guidelines:

1. **Signal Cards Should Display:**
   - User avatar and username
   - Token symbol and direction arrow (↑/↓)
   - Entry price vs current price
   - P&L percentage (green for profit, red for loss)
   - Time remaining for active calls
   - Status badge (active/won/lost/expired)

2. **Color Scheme:**
   - Green: Profitable calls, "up" predictions
   - Red: Loss calls, "down" predictions
   - Blue: Active calls
   - Gray: Expired calls

3. **Loading States:**
   - Skeleton loaders for cards
   - Spinner for price updates
   - Disable buttons during API calls

4. **Success Feedback:**
   - Toast notifications for successful actions
   - Confetti animation for winning calls
   - Sound effects for notifications (optional)

### Performance Optimizations:

- Implement virtual scrolling for long lists
- Cache token metadata to avoid repeated API calls
- Debounce search inputs
- Lazy load images and non-critical data
- Use pagination to limit data fetching

### State Management:

Use your preferred state management solution (Redux, Zustand, Context, etc.) to manage:

- Signal feed data and filters
- User authentication state
- Token price cache
- Loading states across components

### Testing Requirements:

- Unit tests for utility functions
- Integration tests for API calls
- E2E tests for critical user flows
- Mock API responses for development

The backend handles all the complex logic including auto-settling expired calls, calculating P&L, updating user statistics, and maintaining the leaderboard rankings. Your frontend just needs to provide an intuitive interface to interact with these endpoints.

Focus on creating a clean, responsive interface that makes it easy for users to create signals, track performance, and compete on the leaderboard. The platform should feel like a social prediction game with real-time updates and engaging user experience.
