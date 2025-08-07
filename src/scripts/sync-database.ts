import 'dotenv/config';
import { AppDataSource } from '../data-source';

async function syncDatabase() {
  try {
    console.log('🔄 Initializing database connection...');
    await AppDataSource.initialize();

    console.log('🔄 Syncing database schema...');
    await AppDataSource.synchronize(true);

    console.log('✅ Database schema synchronized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    process.exit(1);
  }
}

syncDatabase();
