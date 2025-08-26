// src/health/health.controller.ts
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService, CacheInterceptor, CacheKey, CacheTTL } from '../cache';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
    openai: 'healthy' | 'unhealthy';
    neynar: 'healthy' | 'unhealthy';
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  environment_variables: {
    database: 'configured' | 'missing';
    openai: 'configured' | 'missing';
    neynar: 'configured' | 'missing';
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private cacheService: CacheService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthStatus> {
    // Check database connectivity
    let databaseStatus: 'healthy' | 'unhealthy' = 'unhealthy';
    try {
      await this.dataSource.query('SELECT 1');
      databaseStatus = 'healthy';
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Check Redis connectivity
    let redisStatus: 'healthy' | 'unhealthy' = 'unhealthy';
    try {
      await this.cacheService.set('health_check', 'ok', 10);
      const testValue = await this.cacheService.get('health_check');
      if (testValue === 'ok') {
        redisStatus = 'healthy';
      }
      await this.cacheService.del('health_check');
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    // Check OpenAI API (simple check)
    let openaiStatus: 'healthy' | 'unhealthy' = 'healthy';
    if (!process.env.OPENAI_API_KEY) {
      openaiStatus = 'unhealthy';
    }

    // Check Neynar API
    let neynarStatus: 'healthy' | 'unhealthy' = 'healthy';
    if (!process.env.NEYNAR_API_KEY) {
      neynarStatus = 'unhealthy';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    const memory = {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    };

    // Environment variable checks
    const envVars = {
      database:
        process.env.DATABASE_HOST &&
        process.env.DATABASE_USER &&
        process.env.DATABASE_PASSWORD
          ? ('configured' as const)
          : ('missing' as const),
      openai: process.env.OPENAI_API_KEY
        ? ('configured' as const)
        : ('missing' as const),
      neynar: process.env.NEYNAR_API_KEY
        ? ('configured' as const)
        : ('missing' as const),
    };

    const allServicesHealthy =
      databaseStatus === 'healthy' &&
      redisStatus === 'healthy' &&
      openaiStatus === 'healthy' &&
      neynarStatus === 'healthy';

    return {
      status: allServicesHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: databaseStatus,
        redis: redisStatus,
        openai: openaiStatus,
        neynar: neynarStatus,
      },
      memory,
      environment_variables: envVars,
    };
  }

  @Get('ready')
  async getReadiness(): Promise<{
    status: string;
    checks: { database: boolean; environment: boolean };
  }> {
    // Readiness probe - more strict than liveness
    const checks = {
      database: false,
      environment: false,
    };

    try {
      // Check if we can actually perform a database operation
      await this.dataSource.query('SELECT COUNT(*) FROM users LIMIT 1');
      checks.database = true;
    } catch (error) {
      console.error('Database readiness check failed:', error);
    }

    // Check critical environment variables
    checks.environment = !!(
      process.env.DATABASE_HOST &&
      process.env.DATABASE_USER &&
      process.env.DATABASE_PASSWORD &&
      process.env.OPENAI_API_KEY &&
      process.env.NEYNAR_API_KEY
    );

    const isReady = checks.database && checks.environment;

    if (!isReady) {
      throw new Error('Service not ready');
    }

    return { status: 'ready', checks };
  }

  @Get('live')
  async getLiveness(): Promise<{
    status: string;
    uptime: number;
    timestamp: string;
  }> {
    // Liveness probe - basic check that the service is running
    return {
      status: 'alive',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ping')
  async getPing(): Promise<{ pong: string; timestamp: string }> {
    // Simple ping endpoint for basic connectivity testing
    return {
      pong: 'pong',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('detailed')
  async getDetailedHealth(): Promise<HealthStatus & { responseTime: number }> {
    const startTime = Date.now();
    const health = await this.getHealth();
    const responseTime = Date.now() - startTime;

    return {
      ...health,
      responseTime,
    };
  }

  @Get('cached')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('health_cached')
  @CacheTTL(30)
  async getCachedHealth(): Promise<HealthStatus & { cached: boolean }> {
    const health = await this.getHealth();
    return {
      ...health,
      cached: true,
    };
  }
}
