// Simple seed file for memetic layer protocol
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../../../models/User/User.model';
import { UserRoleEnum } from '../../../models/User/User.types';

// Load environment variables
dotenv.config();

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  // Database configuration from environment variables
  const dbConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306', 10),
    username: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'sigil_db',
  };

  console.log('📊 Database config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password ? '***' : 'undefined',
    database: dbConfig.database,
  });

  // Create data source
  const dataSource = new DataSource({
    type: 'mysql',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    entities: [User],
    synchronize: false,
    ssl: false,
  });

  try {
    // Initialize the connection
    await dataSource.initialize();
    console.log('📡 Connected to database successfully');

    const userRepository = dataSource.getRepository(User);

    // Clear existing users
    await userRepository.clear();
    console.log('🧹 Cleared existing users');

    // Create 5 mock users
    const mockUsers = [
      {
        fid: 12345,
        username: 'alice_crypto',
        pfpUrl: 'https://example.com/avatar1.png',
        role: UserRoleEnum.ADMIN,
        notificationsEnabled: true,
        totalRuns: 25,
        totalDistance: 125.5,
        totalTimeMinutes: 750,
        currentStreak: 5,
        longestStreak: 12,
      },
      {
        fid: 23456,
        username: 'bob_protocol',
        pfpUrl: 'https://example.com/avatar2.png',
        role: UserRoleEnum.USER,
        notificationsEnabled: false,
        totalRuns: 18,
        totalDistance: 89.2,
        totalTimeMinutes: 540,
        currentStreak: 3,
        longestStreak: 8,
      },
      {
        fid: 34567,
        username: 'charlie_memetic',
        pfpUrl: 'https://example.com/avatar3.png',
        role: UserRoleEnum.USER,
        notificationsEnabled: true,
        totalRuns: 42,
        totalDistance: 210.8,
        totalTimeMinutes: 1260,
        currentStreak: 7,
        longestStreak: 15,
      },
      {
        fid: 45678,
        username: 'diana_layer',
        pfpUrl: 'https://example.com/avatar4.png',
        role: UserRoleEnum.USER,
        notificationsEnabled: true,
        totalRuns: 33,
        totalDistance: 165.3,
        totalTimeMinutes: 990,
        currentStreak: 2,
        longestStreak: 10,
      },
      {
        fid: 56789,
        username: 'eve_network',
        pfpUrl: 'https://example.com/avatar5.png',
        role: UserRoleEnum.USER,
        notificationsEnabled: false,
        totalRuns: 15,
        totalDistance: 72.1,
        totalTimeMinutes: 450,
        currentStreak: 1,
        longestStreak: 6,
      },
    ];

    // Insert users
    const users = userRepository.create(mockUsers);
    await userRepository.save(users);

    console.log('✅ Successfully seeded 5 mock users:');
    users.forEach(user => {
      console.log(`   • ${user.username} (FID: ${user.fid}) - ${user.role}`);
    });

    console.log('🎉 Database seeding completed successfully!');
    
    // Close the connection
    await dataSource.destroy();
    process.exit(0);

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    
    // Close the connection on error
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();