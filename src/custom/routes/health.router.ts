/**
 * Custom Health Check Routes
 *
 * This router provides health check endpoints that can be used with:
 * - Load balancers (ALB, NLB)
 * - Container orchestrators (Kubernetes, ECS)
 * - Monitoring systems
 *
 * To enable these routes, add to your main router:
 *
 * import { CustomHealthRouter } from './custom/routes/health.router';
 * router.use('/health', new CustomHealthRouter(prismaRepository, cache, waMonitor).router);
 */

import { CacheService } from '@api/services/cache.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Router } from 'express';
import { CustomHealthController } from '../controllers/health.controller';

export class CustomHealthRouter {
  public readonly router: Router;
  private readonly controller: CustomHealthController;

  constructor(
    prismaRepository?: PrismaRepository,
    cache?: CacheService,
    waMonitor?: WAMonitoringService,
  ) {
    this.router = Router();
    this.controller = new CustomHealthController(prismaRepository, cache, waMonitor);
    this.setupRoutes();
  }

  private setupRoutes() {
    /**
     * GET /health
     * Detailed health check with all system components
     */
    this.router.get('/', (req, res) => this.controller.check(req, res));

    /**
     * GET /health/live
     * Kubernetes/ECS liveness probe
     * Returns 200 if application is running
     */
    this.router.get('/live', (req, res) => this.controller.liveness(req, res));

    /**
     * GET /health/ready
     * Kubernetes/ECS readiness probe
     * Returns 200 if application is ready to accept traffic
     */
    this.router.get('/ready', (req, res) => this.controller.readiness(req, res));
  }
}
