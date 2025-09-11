# Historical Data API Configuration

This document describes the fallback API services used for fetching historical market cap data when CoinGecko fails.

## Overview

The system now uses a multi-provider approach for historical data:

1. **Primary**: CoinGecko (existing)
2. **Fallback 1**: CoinMarketCap
3. **Fallback 2**: CoinDesk (limited Base token support)
4. **Fallback 3**: CoinAPI

## Required Environment Variables

### CoinMarketCap API
```bash
COINMARKETCAP_API_KEY=your_coinmarketcap_pro_api_key_here
```

**How to get:**
1. Sign up at https://pro.coinmarketcap.com/
2. Choose a plan (Basic, Hobbyist, Startup, Standard, Professional, Enterprise)
3. Generate API key in dashboard
4. **Rate Limits**: 333 calls/day (Basic), 3,333 calls/day (Hobbyist), 10,000 calls/day (Startup)

### CoinDesk API
```bash
COINDESK_API_KEY=your_coindesk_api_key_here
```

**How to get:**
1. Sign up at https://developers.coindesk.com/
2. Create API key in developer dashboard
3. **Rate Limits**: Check current documentation
4. **Note**: Primarily covers Bitcoin and major cryptocurrencies - limited Base token support

### CoinAPI
```bash
COINAPI_KEY=your_coinapi_key_here
```

**How to get:**
1. Sign up at https://www.coinapi.io/
2. Generate API key in dashboard
3. **Rate Limits**: 100 requests/day (Free), 100,000 requests/month (Startup)
4. **Note**: Primarily for major cryptocurrencies, limited Base token support

## Provider Reliability & Coverage

### CoinMarketCap (Recommended)
- ✅ **Best coverage** for Base tokens
- ✅ **Reliable historical data**
- ✅ **Market cap data available**
- ❌ More expensive than alternatives
- 🔄 Rate limit: 1 call per second

### CryptoCompare
- ⚠️ **Limited Base token coverage**  
- ✅ **Good for major tokens**
- ⚠️ **Market cap calculation required**
- ✅ Reasonable pricing
- 🔄 Rate limit: 2 calls per second

### CoinAPI
- ❌ **Poor Base token coverage**
- ✅ **Good for major cryptocurrencies**
- ❌ **No market cap data**
- ✅ Free tier available
- 🔄 Rate limit: 1 call per second

## Configuration Priority

The system tries providers in this order:
1. CoinGecko (existing, primary)
2. CoinMarketCap (best fallback)
3. CryptoCompare (secondary fallback)  
4. CoinAPI (last resort)

## Monitoring & Health Checks

The `HistoricalDataManagerService` provides health check capabilities:

```typescript
// Check provider health
const health = await historicalDataManagerService.getServiceHealth();
console.log('Available providers:', health.totalAvailable);
console.log('Provider details:', health.providers);
```

## Cost Optimization Tips

1. **Start with CoinMarketCap Basic** ($29/month) for reliable Base token coverage
2. **Add CryptoCompare** as a cheaper secondary option
3. **Use CoinAPI free tier** for major tokens only
4. **Monitor usage** with the built-in logging system

## Environment Setup

Add to your `.env` file:

```bash
# Existing CoinGecko (keep this)
COINGECKO_API_KEY=your_existing_coingecko_key

# New fallback providers (add these)
COINMARKETCAP_API_KEY=your_coinmarketcap_key
CRYPTOCOMPARE_API_KEY=your_cryptocompare_key  
COINAPI_KEY=your_coinapi_key
```

## Troubleshooting

### Common Issues

1. **"Missing API key" errors**
   - Ensure all environment variables are set
   - Restart the application after adding new keys

2. **Rate limit errors**
   - Check your plan limits on each provider
   - Monitor usage in the logs

3. **No data for Base tokens**
   - CoinMarketCap has the best Base token coverage
   - Some providers may not support newer/smaller tokens

### Monitoring Logs

The system provides detailed logging:
- ✅ Success: `✅ CoinMarketCap succeeded for 0x123... in 245ms`
- ❌ Failure: `💥 CryptoCompare failed for 0x123...: API error` 
- 🚨 All failed: `🚨 All providers failed for 0x123...`

## Support & Updates

- **Contact**: Check provider documentation for API support
- **Updates**: Monitor this file for configuration changes
- **Costs**: Review your API usage monthly to optimize costs