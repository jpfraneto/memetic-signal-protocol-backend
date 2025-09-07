import 'dotenv/config';
import { AppDataSource } from '../data-source';

async function resetDatabase() {
  try {
    console.log('🔄 Initializing database connection...');
    await AppDataSource.initialize();

    console.log('🗑️  Dropping all tables...');
    await AppDataSource.synchronize(true);

    console.log('✅ Database has been completely reset!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  }
}

resetDatabase();
