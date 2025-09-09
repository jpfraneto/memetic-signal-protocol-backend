import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { Logger } from '@nestjs/common';

const logger = new Logger('SyncDatabase');

async function syncDatabase() {
  try {
    logger.log('🔄 Initializing database connection...');
    await AppDataSource.initialize();

    logger.log('🔄 Syncing database schema...');
    await AppDataSource.synchronize(true);

    logger.log('✅ Database schema synchronized successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Database sync failed:', error);
    process.exit(1);
  }
}

syncDatabase();
