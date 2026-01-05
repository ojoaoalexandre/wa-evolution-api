# Custom Features - WA Evolution API Fork

Este diretório contém customizações específicas do nosso fork do Evolution API. Todos os arquivos aqui são **novos** e não modificam o código upstream, garantindo zero conflitos em futuras sincronizações.

## 📁 Estrutura

```
src/custom/
├── controllers/
│   └── health.controller.ts      # Health checks avançados
├── middleware/
│   └── rate-limit.middleware.ts  # Rate limiting por API key
├── routes/
│   └── health.router.ts          # Rotas de health check
└── README.md                      # Esta documentação
```

## 🏥 Health Check Avançado

### Características

- **Liveness Probe**: Verifica se a aplicação está rodando
- **Readiness Probe**: Verifica se a aplicação está pronta para receber tráfego
- **Detailed Check**: Status completo de todos os componentes (DB, Redis, Instâncias)

### Endpoints

#### `GET /health`
Health check detalhado com status de todas as dependências.

**Resposta de sucesso (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T20:00:00.000Z",
  "version": "2.3.7",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "ok",
      "latency": 5
    },
    "redis": {
      "status": "ok",
      "latency": 2
    },
    "instances": {
      "status": "ok",
      "total": 10,
      "connected": 8,
      "disconnected": 2
    }
  }
}
```

**Resposta de erro (503):**
```json
{
  "status": "unhealthy",
  "timestamp": "2026-01-05T20:00:00.000Z",
  "checks": {
    "database": {
      "status": "error",
      "message": "Connection refused"
    },
    "redis": { "status": "ok" },
    "instances": { "status": "ok" }
  }
}
```

#### `GET /health/live`
Liveness probe para Kubernetes/ECS. Sempre retorna 200 se a aplicação está rodando.

**Resposta (200):**
```json
{
  "alive": true,
  "timestamp": "2026-01-05T20:00:00.000Z"
}
```

#### `GET /health/ready`
Readiness probe para Kubernetes/ECS. Retorna 200 apenas se DB e Redis estão acessíveis.

**Resposta pronto (200):**
```json
{
  "ready": true,
  "timestamp": "2026-01-05T20:00:00.000Z"
}
```

**Resposta não pronto (503):**
```json
{
  "ready": false,
  "timestamp": "2026-01-05T20:00:00.000Z",
  "checks": {
    "database": { "status": "error", "message": "..." },
    "redis": { "status": "ok" }
  }
}
```

### Como Habilitar

No arquivo `src/api/routes/index.router.ts`, adicione:

```typescript
import { CustomHealthRouter } from '../custom/routes/health.router';
import { prismaRepository, cache, waMonitor } from '@api/server.module';

// Adicione antes das outras rotas
router.use('/health', new CustomHealthRouter(prismaRepository, cache, waMonitor).router);
```

### Configuração no ECS Task Definition

```json
{
  "healthCheck": {
    "command": ["CMD-SHELL", "curl -f http://localhost:8080/health/live || exit 1"],
    "interval": 30,
    "timeout": 10,
    "retries": 3,
    "startPeriod": 60
  }
}
```

### Configuração no Kubernetes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
```

## 🚦 Rate Limiting

### Características

- **Baseado em API Key**: Limita requisições por API key
- **Redis-backed**: Usa Redis para armazenar contadores
- **Configurável**: Totalmente configurável via variáveis de ambiente
- **Headers padrão**: Retorna headers X-RateLimit-* padrão
- **Fail-open**: Em caso de erro, permite a requisição (não bloqueia serviço)

### Configuração

Adicione ao `.env`:

```bash
# Habilitar rate limiting
RATE_LIMIT_ENABLED=true

# Configurações
RATE_LIMIT_POINTS=100           # Máximo de requisições
RATE_LIMIT_DURATION=60          # Por período (em segundos)
RATE_LIMIT_BLOCK_DURATION=60    # Tempo de bloqueio ao exceder (em segundos)
```

### Como Habilitar

No arquivo `src/api/routes/index.router.ts`, adicione:

```typescript
import { createRateLimitMiddleware } from '../custom/middleware/rate-limit.middleware';
import { cache } from '@api/server.module';

// Adicione ANTES das rotas que deseja proteger
const rateLimiter = createRateLimitMiddleware(cache);
router.use(rateLimiter);
```

### Headers de Resposta

Toda resposta incluirá:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2026-01-05T20:01:00.000Z
```

Ao exceder o limite (429):

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 60
}
```

Com header adicional:
```
Retry-After: 60
```

### Customização Programática

```typescript
import { createRateLimitMiddleware } from '../custom/middleware/rate-limit.middleware';

const customRateLimiter = createRateLimitMiddleware(cache, {
  enabled: true,
  points: 50,        // 50 requests
  duration: 60,      // per minute
  blockDuration: 300 // block for 5 minutes
});

router.use('/api/heavy-endpoint', customRateLimiter);
```

## 📊 Métricas Prometheus

O Evolution API já possui métricas Prometheus integradas. Nosso fork mantém essa funcionalidade.

### Endpoint

`GET /metrics` (requer autenticação se configurado)

### Configuração

No `.env`:

```bash
# Habilitar métricas
PROMETHEUS_METRICS=true

# Autenticação (opcional)
METRICS_AUTH_REQUIRED=true
METRICS_USER=prometheus
METRICS_PASSWORD=your-secure-password

# IP whitelist (opcional)
METRICS_ALLOWED_IPS=127.0.0.1,10.0.0.0/8,172.16.0.0/12
```

### Métricas Disponíveis

- `evolution_environment_info`: Informações do ambiente
- `evolution_instances_total`: Total de instâncias WhatsApp
- `evolution_instance_up`: Status de cada instância (1=conectada, 0=desconectada)
- `evolution_instance_state`: Estado de cada instância com labels

## 🔧 Integração Completa

### Exemplo de Setup Completo

Arquivo `src/api/routes/index.router.ts`:

```typescript
import { Router } from 'express';
import { CustomHealthRouter } from '../custom/routes/health.router';
import { createRateLimitMiddleware } from '../custom/middleware/rate-limit.middleware';
import { prismaRepository, cache, waMonitor } from '@api/server.module';

const router = Router();

// 1. Health checks (sem rate limit)
router.use('/health', new CustomHealthRouter(prismaRepository, cache, waMonitor).router);

// 2. Métricas (já configurado no código base)
// GET /metrics

// 3. Rate limiting (aplicado globalmente)
const rateLimiter = createRateLimitMiddleware(cache);
router.use(rateLimiter);

// 4. Suas rotas normais...
router.use('/instance', instanceRouter);
// ...

export default router;
```

## 🚀 Deploy

### AWS ECS/Fargate

O `Dockerfile.custom` já está configurado com health checks:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health/live || exit 1
```

### Kubernetes

Use os probes configurados na seção de Health Check.

### ALB/NLB

Configure health checks:
- **Path**: `/health/ready`
- **Port**: 8080
- **Interval**: 30s
- **Timeout**: 10s
- **Healthy threshold**: 2
- **Unhealthy threshold**: 3

## 📝 Notas Importantes

### Compatibilidade com Upstream

✅ **Todos os arquivos neste diretório são novos**
- Zero conflitos em futuras sincronizações com upstream
- Podem ser facilmente habilitados/desabilitados
- Não modificam comportamento padrão do Evolution API

### Sincronização

Ao sincronizar com upstream:

```bash
./scripts/sync-upstream.sh v2.4.0
```

Os arquivos em `src/custom/` **nunca terão conflitos** porque não existem no upstream.

### Desabilitar Customizações

Para desabilitar qualquer customização, basta:

1. **Health Checks**: Remover a linha de registro da rota
2. **Rate Limiting**: Definir `RATE_LIMIT_ENABLED=false` ou remover middleware
3. **Métricas**: Definir `PROMETHEUS_METRICS=false`

## 🔍 Troubleshooting

### Health check retorna 503

Verifique:
1. PostgreSQL está acessível?
2. Redis está acessível?
3. Credenciais corretas no `.env`?

### Rate limiting não funciona

Verifique:
1. `RATE_LIMIT_ENABLED=true` no `.env`
2. Redis está funcionando
3. Middleware foi registrado corretamente

### Métricas não aparecem

Verifique:
1. `PROMETHEUS_METRICS=true` no `.env`
2. Autenticação configurada corretamente
3. IP está no whitelist (se configurado)

## 📚 Referências

- [Evolution API Docs](https://doc.evolution-api.com/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Kubernetes Health Checks](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [AWS ECS Health Checks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#container_definition_healthcheck)
