/**
 * Custom Health Check Controller
 *
 * This controller provides enhanced health check endpoints for:
 * - Kubernetes/ECS liveness probes
 * - Kubernetes/ECS readiness probes
 * - Detailed health status with dependency checks
 *
 * Usage:
 * - GET /health - Detailed health check with all dependencies
 * - GET /health/live - Simple liveness check (always returns 200 if app is running)
 * - GET /health/ready - Readiness check (checks database and redis)
 */

import { CacheService } from '@api/services/cache.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { Request, Response } from 'express';

export class CustomHealthController {
  private readonly logger = new Logger('CustomHealthController');

  constructor(
    private readonly prismaRepository?: PrismaRepository,
    private readonly cache?: CacheService,
    private readonly waMonitor?: WAMonitoringService,
  ) {}

  /**
   * Detailed health check
   * Returns comprehensive status of all system components
   */
  async check(req: Request, res: Response) {
    try {
      const checks = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkInstances(),
      ]);

      const [database, redis, instances] = checks.map((r) =>
        r.status === 'fulfilled' ? r.value : { status: 'error', error: String(r.reason) },
      );

      const isHealthy = database.status === 'ok' && redis.status === 'ok';

      const response = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || 'unknown',
        uptime: process.uptime(),
        checks: {
          database,
          redis,
          instances,
        },
      };

      res.status(isHealthy ? 200 : 503).json(response);
    } catch (error) {
      this.logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: String(error),
      });
    }
  }

  /**
   * Liveness probe
   * Simple check to verify the application is running
   * Used by Kubernetes/ECS to determine if container should be restarted
   */
  async liveness(req: Request, res: Response) {
    res.status(200).json({
      alive: true,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Readiness probe
   * Checks if the application is ready to accept traffic
   * Used by Kubernetes/ECS to determine if container should receive traffic
   */
  async readiness(req: Request, res: Response) {
    try {
      const [dbCheck, redisCheck] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
      ]);

      const dbResult = dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'error' };
      const redisResult = redisCheck.status === 'fulfilled' ? redisCheck.value : { status: 'error' };

      const isReady = dbResult.status === 'ok' && redisResult.status === 'ok';

      if (!isReady) {
        return res.status(503).json({
          ready: false,
          timestamp: new Date().toISOString(),
          checks: {
            database: dbResult,
            redis: redisResult,
          },
        });
      }

      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Readiness check failed:', error);
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: String(error),
      });
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<{ status: string; message?: string; latency?: number }> {
    if (!this.prismaRepository) {
      return { status: 'disabled', message: 'Database not configured' };
    }

    try {
      const start = Date.now();
      await this.prismaRepository.instance.findMany({ take: 1 });
      const latency = Date.now() - start;

      return { status: 'ok', latency };
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return { status: 'error', message: String(error) };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<{ status: string; message?: string; latency?: number }> {
    if (!this.cache) {
      return { status: 'disabled', message: 'Redis not configured' };
    }

    try {
      const start = Date.now();
      const testKey = `health:check:${Date.now()}`;
      await this.cache.set(testKey, 'ok', 10);
      await this.cache.get(testKey);
      await this.cache.delete(testKey);
      const latency = Date.now() - start;

      return { status: 'ok', latency };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return { status: 'error', message: String(error) };
    }
  }

  /**
   * Check WhatsApp instances status
   */
  private async checkInstances(): Promise<{
    status: string;
    total?: number;
    connected?: number;
    disconnected?: number;
  }> {
    if (!this.waMonitor) {
      return { status: 'disabled' };
    }

    try {
      const instances = this.waMonitor.waInstances || {};
      const instanceList = Object.values(instances);
      const connected = instanceList.filter((i: any) => i?.connectionStatus?.state === 'open').length;

      return {
        status: 'ok',
        total: instanceList.length,
        connected,
        disconnected: instanceList.length - connected,
      };
    } catch (error) {
      this.logger.error('Instances check failed:', error);
      return { status: 'error', total: 0, connected: 0, disconnected: 0 };
    }
  }
}
