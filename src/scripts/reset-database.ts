import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { Logger } from '@nestjs/common';

const logger = new Logger('ResetDatabase');

async function resetDatabase() {
  try {
    logger.log('🔄 Initializing database connection...');
    await AppDataSource.initialize();

    logger.log('🗑️  Dropping all tables...');
    await AppDataSource.synchronize(true);

    logger.log('✅ Database has been completely reset!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Database reset failed:', error);
    process.exit(1);
  }
}

resetDatabase();
