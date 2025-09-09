import { PortfolioService } from '../core/zapper/services/portfolio.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('TestPortfolio');

async function testPortfolioService() {
  logger.log('🧪 Testing Portfolio Service...');

  const portfolioService = new PortfolioService();

  // Test with a sample Ethereum address
  const testAddress = '0x3d280fde2ddb59323c891cf30995e1862510342f';

  try {
    logger.log(`📊 Fetching portfolio for address: ${testAddress}`);

    const portfolio = await portfolioService.getPortfolioForUser(testAddress, [
      'ETHEREUM_MAINNET',
    ]);

    logger.log(
      `✅ Successfully fetched portfolio with ${portfolio.length} tokens`,
    );

    if (portfolio.length > 0) {
      logger.log('\n📋 Portfolio Summary:');
      portfolio.slice(0, 5).forEach((token, index) => {
        logger.log(`${index + 1}. ${token.name} (${token.symbol})`);
        logger.log(`   Balance: ${token.balance}`);
        logger.log(`   Value: $${token.balanceUSD.toFixed(2)}`);
        logger.log('');
      });
    } else {
      logger.log('📭 No tokens found in portfolio');
    }
  } catch (error) {
    logger.error('❌ Error testing portfolio service:', error);
  }

  logger.log('🏁 Portfolio service test completed');
}

// Run the test
testPortfolioService().catch((error) => logger.error('Test failed:', error));
