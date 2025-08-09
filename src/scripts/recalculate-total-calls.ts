import { AppDataSource } from '../data-source';
import { UserService } from '../core/user/services/user.service';

async function recalculateTotalCalls() {
  try {
    console.log('🔄 Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✅ Database connected successfully');

    const userService = new UserService(
      AppDataSource.getRepository('User'),
      AppDataSource.getRepository('Call'),
    );

    console.log('🔄 Recalculating total calls for all users...');
    await userService.recalculateTotalCalls();
    console.log('✅ Total calls recalculation completed');

    console.log('🔄 Closing database connection...');
    await AppDataSource.destroy();
    console.log('✅ Database connection closed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during total calls recalculation:', error);
    process.exit(1);
  }
}

recalculateTotalCalls();
