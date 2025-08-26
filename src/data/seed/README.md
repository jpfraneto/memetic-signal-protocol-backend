# Seed Data Format

This directory contains JSON files for seeding the database with test data. The seeding script looks for the following files:

## File Structure

```
src/data/seed/
├── users.json     # User data
├── tokens.json    # Token data
├── signals.json   # Signal data (optional)
└── README.md      # This file
```

## Data Formats

### users.json

Array of user objects with the following structure:

```json
[
  {
    "fid": 1,
    "username": "testuser",
    "displayName": "Test User",
    "bio": "Crypto enthusiast and signal trader",
    "avatar": "https://example.com/avatar.jpg",
    "pfpUrl": "https://example.com/avatar.jpg",
    "isVerified": false,
    "followerCount": 100,
    "followingCount": 50,
    "mfsScore": 2.5,
    "winRate": 65.0,
    "totalSignals": 10,
    "activeSignals": 2,
    "settledSignals": 8,
    "totalStaked": 1000.0,
    "rank": 1,
    "role": "USER",
    "notificationsEnabled": true,
    "isBanned": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "lastActiveAt": "2024-01-01T00:00:00.000Z",
    "lastSignalDate": "2024-01-01T00:00:00.000Z",
    "usedRetryToday": false,
    "submittedSignalToday": false,
    "stateOnTheSystem": "WITH_ACCOUNT",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "jbmBalance": "1000000",
    "isSubscriber": false,
    "subscriptionExpiresAt": null,
    "subscribedAt": null
  }
]
```

#### Required Fields:
- `fid` (number): Farcaster ID
- `username` (string): Unique username
- `isVerified` (boolean)
- `followerCount` (number)
- `followingCount` (number)
- `mfsScore` (number): Memetic fitness score
- `winRate` (number): Win rate percentage
- `totalSignals` (number)
- `activeSignals` (number)
- `settledSignals` (number)
- `totalStaked` (number)
- `role` (string): "USER" | "ADMIN" | "MODERATOR"
- `notificationsEnabled` (boolean)
- `isBanned` (boolean)
- `createdAt` (string): ISO date string
- `updatedAt` (string): ISO date string
- `usedRetryToday` (boolean)
- `submittedSignalToday` (boolean)
- `stateOnTheSystem` (string): "WITHOUT_ACCOUNT" | "WITH_ACCOUNT" | "VERIFIED"
- `isSubscriber` (boolean)

#### Optional Fields:
- `displayName`, `bio`, `avatar`, `pfpUrl`, `rank`, `lastActiveAt`, `lastSignalDate`, `walletAddress`, `jbmBalance`, `subscriptionExpiresAt`, `subscribedAt`

### tokens.json

Array of token objects with the following structure:

```json
[
  {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "name": "Test Token",
    "symbol": "TEST",
    "decimals": 18,
    "categories": ["meme", "defi"],
    "description": "A test token for development",
    "image": "https://example.com/token.png",
    "image_small": "https://example.com/token_small.png",
    "image_thumb": "https://example.com/token_thumb.png",
    "market_cap_rank": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Required Fields:
- `address` (string): Token contract address
- `name` (string): Token name
- `symbol` (string): Token symbol/ticker
- `decimals` (number): Token decimals (usually 18)
- `categories` (array): Array of category strings
- `createdAt` (string): ISO date string
- `updatedAt` (string): ISO date string

#### Optional Fields:
- `description`, `image`, `image_small`, `image_thumb`, `market_cap_rank`

### signals.json

Array of signal objects with the following structure:

```json
[
  {
    "signalId": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
    "tokenAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "tokenTicker": "TEST",
    "initialMarketCap": 1000000,
    "direction": "UP",
    "timestamp": 1640995200000,
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "status": "WON",
    "fid": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Required Fields:
- `signalId` (string): Unique signal identifier (transaction hash format)
- `tokenAddress` (string): Token contract address
- `tokenTicker` (string): Token symbol
- `initialMarketCap` (number): Market cap at signal creation time
- `direction` (string): "UP" | "DOWN"
- `timestamp` (number): Unix timestamp
- `expiresAt` (string): ISO date string
- `status` (string): "ACTIVE" | "WON" | "LOST" | "EXPIRED"
- `fid` (number): User's Farcaster ID (must exist in users.json)
- `createdAt` (string): ISO date string
- `updatedAt` (string): ISO date string

## Usage

1. **Generate seed data**: Use your external script to generate the JSON files
2. **Place files**: Put the generated `users.json`, `tokens.json`, and `signals.json` files in this directory
3. **Run seeding**: Execute the seeding script with:
   ```bash
   bun run db:seed
   ```

## Notes

- The seeding script will automatically clear existing data before seeding
- Signals will only be created for users that exist in the `users.json` file
- If any file is missing, the seeder will create minimal default data for that entity type
- All date strings should be in ISO 8601 format
- The `initialMarketCap` can be provided as either a number or string - the seeder will handle conversion
- Foreign key relationships are automatically handled (signals reference users by `fid`)

## Example Generation Script Output

Your generation script should output files compatible with these formats. The script you provided generates data in the correct format for:
- ✅ Users with all required fields
- ✅ Tokens with categories and metadata
- ✅ Signals with simplified single-token structure