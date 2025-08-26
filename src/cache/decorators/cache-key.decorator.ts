import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache_key';

export const CacheKey = (key: string) => SetMetadata(CACHE_KEY_METADATA, key);