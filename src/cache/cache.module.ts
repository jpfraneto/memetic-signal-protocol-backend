import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';
import { CacheInterceptor } from './interceptors/cache.interceptor';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      ttl: 300,
    }),
  ],
  providers: [CacheService, CacheInterceptor],
  exports: [CacheModule, CacheService, CacheInterceptor],
})
export class RedisCacheModule {}
