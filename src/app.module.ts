// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Core
import CoreModules from './core';
// Security
import { getConfig } from './security/config';
// Health
import { HealthModule } from './health';
// Cache
import { RedisCacheModule } from './cache/cache.module';
// Models
import {
  User,
  Signal,
  NotificationQueue,
  Token,
  PriceSnapshot,
} from './models';
// Ponder entities
import { FidStats } from './models/FidStats/FidStats.model';
import { WalletAuthorization } from './models/WalletAuthorization/WalletAuthorization.model';
import { DailySignalCount } from './models/DailySignalCount/DailySignalCount.model';
import { FidBan } from './models/FidBan/FidBan.model';
import { WalletBan } from './models/WalletBan/WalletBan.model';

@Module({
  imports: [
    ...CoreModules,
    HealthModule,
    RedisCacheModule,

    // ✅ Postgres via single DATABASE_URL (works in dev + Railway)
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is not set');

        // Local (Railway proxy) uses ?sslmode=require; on Railway internal URL, it won’t.
        const ssl = url.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : false;

        return {
          type: 'postgres' as const,
          url,
          ssl,
          synchronize: false,
          logging: false,
          entities: [
            User,
            Signal,
            NotificationQueue,
            Token,
            PriceSnapshot,
            FidStats,
            WalletAuthorization,
            DailySignalCount,
            FidBan,
            WalletBan,
          ],
          // Pool (pg uses max instead of connectionLimit)
          extra: { max: 10 },
          autoLoadEntities: false, // using explicit entities array above
        };
      },
    }),
  ],
})
export class AppModule {}
