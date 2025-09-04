# Wallet Verification Endpoint

## Overview

The `/auth-service/get-signature` endpoint verifies wallet ownership for Farcaster users and generates authorization signatures for on-chain transactions.

## Purpose

This endpoint bridges the gap between Farcaster's social identity system and on-chain reputation tracking by:

1. Verifying that a wallet address is authorized for a specific Farcaster ID
2. Generating cryptographic proof (EIP-712 signature) for on-chain authorization
3. Enabling secure price prediction signaling on the blockchain

## Endpoint Details

- **URL**: `POST /auth-service/get-signature`
- **Authentication**: Requires AuthorizationGuard (Farcaster QuickAuth)
- **Rate Limit**: 5 requests per minute per IP (implemented via cache)

## Request Body

```json
{
  "fid": 12345,
  "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
}
```

### Parameters

- `fid` (number): Farcaster ID of the user
- `walletAddress` (string): Ethereum wallet address to verify (must be checksummed)

## Response

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "authData": "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000065a4c2400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000003930390000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041...",
    "deadline": "1705123456"
  }
}
```

### Error Responses

#### Invalid Wallet Address (400)

```json
{
  "success": false,
  "error": "Invalid wallet address format."
}
```

#### Wallet Not Authorized (401)

```json
{
  "success": false,
  "error": "Wallet not authorized for FID."
}
```

#### API Error (500)

```json
{
  "success": false,
  "error": "Failed to fetch Farcaster user data."
}
```

## Implementation Details

### Verification Process

1. **Input Validation**: Validates wallet address format using Viem's `isAddress()`
2. **Cache Check**: Checks for cached Farcaster user data (10-minute TTL)
3. **API Fetch**: If not cached, fetches user data from Neynar API
4. **Address Verification**: Checks if wallet address is in:
   - `user.verified_addresses.eth_addresses[]`
   - `user.auth_addresses[].address`
5. **Signature Generation**: Creates EIP-712 signature with:
   - Domain: ProjectLighthouseV15, version 1, chainId 8453
   - Message: Authorization(uint32 fid, address wallet, uint256 deadline)
   - Deadline: 1 hour from request time

### EIP-712 Signature Details

- **Domain**: ProjectLighthouseV15
- **Version**: 1
- **Chain ID**: 8453 (Base)
- **Contract**: Configurable via `CONTRACT_ADDRESS` environment variable
- **Message Type**: Authorization
- **Fields**: fid (uint32), wallet (address), deadline (uint256)

### Environment Variables Required

```bash
# Required for signature generation
BACKEND_PRIVATE_KEY=your_private_key (with or without 0x prefix)

# Required for Farcaster API calls
NEYNAR_API_KEY=your_neynar_api_key

# Optional: Contract address (defaults to 0x84249CB1632eD033502935baad01a4bc263bbCFA)
CONTRACT_ADDRESS=0x84249CB1632eD033502935baad01a4bc263bbCFA
```

## Usage Example

### Frontend Integration

```typescript
const verifyWallet = async (fid: number, walletAddress: string) => {
  const response = await fetch('/auth-service/get-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${farcasterToken}`,
    },
    body: JSON.stringify({ fid, walletAddress }),
  });

  const data = await response.json();

  if (data.success) {
    // Use authData in smart contract transaction
    const { authData, deadline } = data.data;
    // Submit to blockchain with authData
  } else {
    throw new Error(data.error);
  }
};
```

### Smart Contract Integration

The `authData` returned by this endpoint should be included in the first transaction to the smart contract. The contract will:

1. Verify the signature came from the trusted backend
2. Store the wallet-to-FID mapping on-chain
3. Allow subsequent transactions without backend authorization

## Security Considerations

- **Private Key Security**: The backend private key must be kept secure
- **Rate Limiting**: Implemented to prevent abuse
- **Caching**: Reduces API calls to Neynar while maintaining data freshness
- **Input Validation**: Validates all inputs before processing
- **Error Handling**: Graceful handling of API failures

## Monitoring

The endpoint logs:

- Successful verifications
- Failed verifications with reasons
- API errors from Neynar
- Cache hits/misses

## Dependencies

- **Viem**: For Ethereum address validation and EIP-712 signing
- **Neynar SDK**: For Farcaster user data fetching
- **NestJS Cache**: For user data caching
- **Class Validator**: For request body validation
