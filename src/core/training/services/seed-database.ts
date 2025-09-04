// src/core/training/services/seed-database.ts
// Database reset script - completely drops all schemas and data
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { getConfig } from '../../../security/config';

// Load environment: prefer .env.development locally, fallback .env
dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env.development',
});

async function resetDatabase() {
  console.log('🗑️  Starting complete database reset...');

  const config = getConfig();

  const dataSource = new DataSource({
    type: 'postgres',
    ...(config.db.url
      ? { url: config.db.url }
      : {
          host: config.db.host,
          port: config.db.port,
          username: config.db.username,
          password: config.db.password,
          database: config.db.name,
        }),
    ssl: config.db.requireSSL ? { rejectUnauthorized: false } : false,
    entities: [],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('📡 Connected to PostgreSQL');

    // Drop all tables in the public schema
    console.log('🧹 Dropping all tables...');
    await dataSource.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `);

    console.log('✨ Database completely reset - all schemas and data erased');
    console.log('📝 Ponder migrations will recreate the necessary tables');

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    if (dataSource.isInitialized) await dataSource.destroy();
    process.exit(1);
  }
}

resetDatabase();
