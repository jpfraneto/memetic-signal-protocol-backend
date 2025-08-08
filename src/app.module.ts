// src/app.module.ts - Updated for Production with SSL Support
// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// Core
import CoreModules from './core';
// Security
import { getConfig } from './security/config';
// Health
import { HealthModule } from './health';
// Models
import { User, Call, NotificationQueue } from './models';

@Module({
  imports: [
    ...CoreModules,
    HealthModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: getConfig().db.host,
      port: getConfig().db.port,
      username: getConfig().db.username,
      password: getConfig().db.password,
      database: getConfig().db.name,
      entities: [User, Call, NotificationQueue],
      // Important: Set synchronize to false in production for safety
      synchronize: true,
      //synchronize: !getConfig().isProduction,
      logging: getConfig().isProduction ? false : 'all',
      // SSL configuration for DigitalOcean managed database
      ssl: getConfig().db.requireSSL
        ? {
            rejectUnauthorized: false, // Required for DigitalOcean managed databases
          }
        : false,
      extra: {
        // Connection pool settings for production
        connectionLimit: 10,
      },
    }),
  ],
})
export class AppModule {}
