import { PortfolioService } from '../core/zapper/services/portfolio.service';

async function testPortfolioService() {
  console.log('🧪 Testing Portfolio Service...');

  const portfolioService = new PortfolioService();

  // Test with a sample Ethereum address
  const testAddress = '0x3d280fde2ddb59323c891cf30995e1862510342f';

  try {
    console.log(`📊 Fetching portfolio for address: ${testAddress}`);

    const portfolio = await portfolioService.getPortfolioForUser(testAddress, [
      'ETHEREUM_MAINNET',
    ]);

    console.log(
      `✅ Successfully fetched portfolio with ${portfolio.length} tokens`,
    );

    if (portfolio.length > 0) {
      console.log('\n📋 Portfolio Summary:');
      portfolio.slice(0, 5).forEach((token, index) => {
        console.log(`${index + 1}. ${token.name} (${token.symbol})`);
        console.log(`   Balance: ${token.balance}`);
        console.log(`   Value: $${token.balanceUSD.toFixed(2)}`);
        console.log('');
      });
    } else {
      console.log('📭 No tokens found in portfolio');
    }
  } catch (error) {
    console.error('❌ Error testing portfolio service:', error);
  }

  console.log('🏁 Portfolio service test completed');
}

// Run the test
testPortfolioService().catch(console.error);
