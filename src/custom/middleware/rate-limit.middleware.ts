/**
 * Custom Rate Limiting Middleware
 *
 * This middleware provides rate limiting based on API keys using Redis.
 * It can be enabled via environment variables without modifying core code.
 *
 * Configuration (add to .env):
 * RATE_LIMIT_ENABLED=true
 * RATE_LIMIT_POINTS=100           # Max requests
 * RATE_LIMIT_DURATION=60          # Per duration in seconds
 * RATE_LIMIT_BLOCK_DURATION=60    # Block duration if exceeded
 *
 * Usage:
 * import { createRateLimitMiddleware } from './custom/middleware/rate-limit.middleware';
 * const rateLimiter = createRateLimitMiddleware(cache);
 * router.use(rateLimiter);
 */

import { CacheService } from '@api/services/cache.service';
import { Logger } from '@config/logger.config';
import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  enabled: boolean;
  points: number;
  duration: number;
  blockDuration: number;
}

interface RateLimitData {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

export class RateLimitMiddleware {
  private readonly logger = new Logger('RateLimitMiddleware');
  private readonly config: RateLimitConfig;
  private readonly keyPrefix = 'ratelimit:apikey:';

  constructor(
    private readonly cache: CacheService,
    config?: Partial<RateLimitConfig>,
  ) {
    this.config = {
      enabled: process.env.RATE_LIMIT_ENABLED === 'true',
      points: Number(process.env.RATE_LIMIT_POINTS) || 100,
      duration: Number(process.env.RATE_LIMIT_DURATION) || 60,
      blockDuration: Number(process.env.RATE_LIMIT_BLOCK_DURATION) || 60,
      ...config,
    };

    if (this.config.enabled) {
      this.logger.info(
        `Rate limiting enabled: ${this.config.points} requests per ${this.config.duration}s`,
      );
    }
  }

  /**
   * Express middleware function
   */
  public middleware = async (req: Request, res: Response, next: NextFunction) => {
    // Skip if rate limiting is disabled
    if (!this.config.enabled) {
      return next();
    }

    try {
      const apiKey = this.extractApiKey(req);

      // Skip rate limiting if no API key (let auth guard handle it)
      if (!apiKey) {
        return next();
      }

      const result = await this.consume(apiKey);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': String(this.config.points),
        'X-RateLimit-Remaining': String(Math.max(0, this.config.points - result.count)),
        'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
      });

      if (result.blockedUntil && result.blockedUntil > Date.now()) {
        const retryAfter = Math.ceil((result.blockedUntil - Date.now()) / 1000);
        res.set('Retry-After', String(retryAfter));

        this.logger.warn(`Rate limit exceeded for API key: ${this.maskApiKey(apiKey)}`);

        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter,
        });
      }

      next();
    } catch (error) {
      this.logger.error('Rate limit middleware error:', error);
      // On error, allow the request to proceed (fail open)
      next();
    }
  };

  /**
   * Consume one point from the rate limit bucket
   */
  private async consume(apiKey: string): Promise<RateLimitData> {
    const key = this.keyPrefix + apiKey;
    const now = Date.now();

    // Get current rate limit data
    const dataStr = await this.cache.get(key);
    let data: RateLimitData;

    if (dataStr) {
      data = JSON.parse(dataStr);

      // Check if blocked
      if (data.blockedUntil && data.blockedUntil > now) {
        return data;
      }

      // Check if window has expired
      if (data.resetAt <= now) {
        data = {
          count: 1,
          resetAt: now + this.config.duration * 1000,
        };
      } else {
        // Increment count
        data.count += 1;

        // Check if limit exceeded
        if (data.count > this.config.points) {
          data.blockedUntil = now + this.config.blockDuration * 1000;
        }
      }
    } else {
      // First request
      data = {
        count: 1,
        resetAt: now + this.config.duration * 1000,
      };
    }

    // Save updated data
    const ttl = Math.max(
      data.blockedUntil ? Math.ceil((data.blockedUntil - now) / 1000) : 0,
      Math.ceil((data.resetAt - now) / 1000),
    );

    await this.cache.set(key, JSON.stringify(data), ttl);

    return data;
  }

  /**
   * Extract API key from request
   */
  private extractApiKey(req: Request): string | null {
    // Try header first
    let apiKey = req.headers['apikey'] as string;

    // Try authorization bearer token
    if (!apiKey && req.headers.authorization) {
      const match = req.headers.authorization.match(/^Bearer\s+(.+)$/i);
      if (match) {
        apiKey = match[1];
      }
    }

    // Try query parameter (less secure, but supported)
    if (!apiKey && req.query.apikey) {
      apiKey = req.query.apikey as string;
    }

    return apiKey || null;
  }

  /**
   * Mask API key for logging
   */
  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) return '***';
    return apiKey.substring(0, 4) + '***' + apiKey.substring(apiKey.length - 4);
  }
}

/**
 * Factory function to create rate limit middleware
 */
export function createRateLimitMiddleware(
  cache: CacheService,
  config?: Partial<RateLimitConfig>,
): (req: Request, res: Response, next: NextFunction) => void {
  const middleware = new RateLimitMiddleware(cache, config);
  return middleware.middleware;
}
