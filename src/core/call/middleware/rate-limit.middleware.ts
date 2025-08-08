import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  requests: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly rateLimits = new Map<string, RateLimitEntry>();
  private readonly maxRequests = 100; // requests per window
  private readonly windowMs = 60 * 1000; // 1 minute window

  use(req: Request, res: Response, next: NextFunction): void {
    try {
      // Get client identifier (IP or user ID from JWT)
      const clientId = this.getClientIdentifier(req);

      if (!clientId) {
        return next();
      }

      const now = Date.now();
      const entry = this.rateLimits.get(clientId);

      // Reset window if expired
      if (!entry || now > entry.resetTime) {
        this.rateLimits.set(clientId, {
          requests: 1,
          resetTime: now + this.windowMs,
        });
        return next();
      }

      // Check if limit exceeded
      if (entry.requests >= this.maxRequests) {
        const resetIn = Math.ceil((entry.resetTime - now) / 1000);

        res.set({
          'X-RateLimit-Limit': this.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': entry.resetTime.toString(),
          'Retry-After': resetIn.toString(),
        });

        this.logger.warn(`Rate limit exceeded for client ${clientId}`);

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded. Too many requests.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Increment request count
      entry.requests++;
      this.rateLimits.set(clientId, entry);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': this.maxRequests.toString(),
        'X-RateLimit-Remaining': (this.maxRequests - entry.requests).toString(),
        'X-RateLimit-Reset': entry.resetTime.toString(),
      });

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Rate limit middleware error:', error);
      next(); // Continue on middleware errors
    }
  }

  private getClientIdentifier(req: Request): string | null {
    // Try to get user ID from JWT token first
    const userId = (req as any).user?.fid;
    if (userId) {
      return `user:${userId}`;
    }

    // Fall back to IP address
    const ip =
      req.ip ||
      req.connection.remoteAddress ||
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string);

    return ip ? `ip:${ip}` : null;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [clientId, entry] of this.rateLimits.entries()) {
      if (now > entry.resetTime) {
        this.rateLimits.delete(clientId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }
}
