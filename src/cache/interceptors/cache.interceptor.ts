import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_KEY_METADATA } from '../decorators/cache-key.decorator';
import { CACHE_TTL_METADATA } from '../decorators/cache-ttl.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cacheKey = this.reflector.get<string>(CACHE_KEY_METADATA, context.getHandler());
    const cacheTTL = this.reflector.get<number>(CACHE_TTL_METADATA, context.getHandler());

    if (!cacheKey) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const fullCacheKey = this.buildCacheKey(cacheKey, request);

    const cachedResult = await this.cacheManager.get(fullCacheKey);
    if (cachedResult) {
      return new Observable((observer) => {
        observer.next(cachedResult);
        observer.complete();
      });
    }

    return next.handle().pipe(
      tap(async (response) => {
        if (response) {
          await this.cacheManager.set(fullCacheKey, response, cacheTTL || 300);
        }
      }),
    );
  }

  private buildCacheKey(baseKey: string, request: any): string {
    const { query, params, body } = request;
    const keyParts = [baseKey];

    if (params && Object.keys(params).length > 0) {
      keyParts.push(JSON.stringify(params));
    }

    if (query && Object.keys(query).length > 0) {
      keyParts.push(JSON.stringify(query));
    }

    return keyParts.join(':');
  }
}