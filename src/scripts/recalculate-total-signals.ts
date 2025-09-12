import { AppDataSource } from '../data-source';
import { UserService } from '../core/user/services/user.service';
import { User } from '../models';
import { Signal } from '../models';
import { CacheService } from '../cache/cache.service';

// Mock cache service for script
const mockCacheService = {
  invalidateUserProfile: async () => {},
  get: async () => undefined,
  set: async () => {},
  del: async () => {},
} as any;

async function recalculateTotalSignals() {
  try {
    console.log('🔄 Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✅ Database connected successfully');

    const userService = new UserService(
      AppDataSource.getRepository(User),
      AppDataSource.getRepository(Signal),
      mockCacheService,
    );

    console.log('🔄 Recalculating total signals for all users...');
    await userService.recalculateTotalSignals();
    console.log('✅ Total signals recalculation completed');

    console.log('🔄 Closing database connection...');
    await AppDataSource.destroy();
    console.log('✅ Database connection closed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during total signals recalculation:', error);
    process.exit(1);
  }
}

recalculateTotalSignals();
