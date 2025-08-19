// Simple seed file for memetic layer protocol
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../../../models/User/User.model';
import { Signal } from '../../../models/Signal/Signal.model';
import { Token } from '../../../models/Token/Token.model';
import { NotificationQueue } from '../../../models/NotificationQueue/NotificationQueue.model';

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
    entities: [User, Signal, Token, NotificationQueue],
    synchronize: false,
    ssl: false,
  });

  try {
    // Initialize the connection
    await dataSource.initialize();
    console.log('📡 Connected to database successfully');

    // Clear existing data - handle foreign key constraints
    await dataSource.query('DELETE FROM notification_queue');
    await dataSource.query('DELETE FROM signals');
    await dataSource.query('DELETE FROM tokens');
    await dataSource.query('DELETE FROM users');
    console.log('🧹 Cleared existing data');

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
