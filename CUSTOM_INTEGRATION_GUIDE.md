# Guia de Integração - Features Customizadas

> **Abordagem Conservadora**: Todas as customizações são **opcionais** e podem ser habilitadas sem modificar o código base do Evolution API.

## 🎯 Quick Start

### 1. Configuração Básica

Copie o arquivo de configuração customizada:

```bash
cp .env.custom .env
```

Edite o `.env` e configure suas credenciais:
- `DATABASE_CONNECTION_URI`
- `CACHE_REDIS_URI`
- `AUTHENTICATION_API_KEY`
- `S3_BUCKET` (se usar S3)
- `WEBHOOK_GLOBAL_URL` (URL do seu wa-connector-api)

### 2. Habilitar Features Customizadas (Opcional)

As features customizadas são **opt-in** e podem ser habilitadas individualmente.

## 🏥 Health Checks Avançados

### Para Habilitar

Edite `src/api/routes/index.router.ts` e adicione **no início do arquivo**:

```typescript
// Adicione ao imports
import { CustomHealthRouter } from '../custom/routes/health.router';
import { prismaRepository, cache, waMonitor } from '@api/server.module';

// Adicione ANTES das outras rotas (linha ~160)
router.use('/health', new CustomHealthRouter(prismaRepository, cache, waMonitor).router);
```

### Endpoints Disponíveis

- `GET /health` - Status detalhado
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

### Testar

```bash
curl http://localhost:8080/health
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

## 🚦 Rate Limiting

### Para Habilitar

**Passo 1**: Configure no `.env`:

```bash
RATE_LIMIT_ENABLED=true
RATE_LIMIT_POINTS=100
RATE_LIMIT_DURATION=60
RATE_LIMIT_BLOCK_DURATION=60
```

**Passo 2**: Edite `src/api/routes/index.router.ts`:

```typescript
// Adicione ao imports
import { createRateLimitMiddleware } from '../custom/middleware/rate-limit.middleware';

// Adicione DEPOIS do telemetry middleware (linha ~194)
const rateLimiter = createRateLimitMiddleware(cache);
router.use(rateLimiter);
```

### Testar

```bash
# Fazer 101 requisições rápidas deve resultar em 429
for i in {1..101}; do
  curl -H "apikey: your-key" http://localhost:8080/instance/fetchInstances
done
```

## 📊 Métricas Prometheus

### Para Habilitar

Configure no `.env`:

```bash
PROMETHEUS_METRICS=true
METRICS_AUTH_REQUIRED=true
METRICS_USER=prometheus
METRICS_PASSWORD=your-secure-password
METRICS_ALLOWED_IPS=127.0.0.1,10.0.0.0/8
```

**Não precisa modificar código** - já está integrado no Evolution API!

### Testar

```bash
# Com autenticação
curl -u prometheus:your-secure-password http://localhost:8080/metrics

# Exemplo de scrape no Prometheus
curl http://localhost:8080/metrics
```

## 🔧 Exemplo Completo de Integração

### src/api/routes/index.router.ts

Procure a seção onde o router é criado e adicione:

```typescript
// ============================================
// INÍCIO - Customizações WA-Evolution-API
// ============================================

// 1. Health Checks Customizados
import { CustomHealthRouter } from '../custom/routes/health.router';
import { prismaRepository, cache, waMonitor } from '@api/server.module';

router.use('/health', new CustomHealthRouter(prismaRepository, cache, waMonitor).router);

// 2. Rate Limiting (opcional)
import { createRateLimitMiddleware } from '../custom/middleware/rate-limit.middleware';

const rateLimiter = createRateLimitMiddleware(cache);

// ============================================
// FIM - Customizações WA-Evolution-API
// ============================================

router
  .use((req, res, next) => telemetry.collectTelemetry(req, res, next))
  .use(rateLimiter) // <- Adicione o rate limiter aqui
  .get('/', async (req, res) => {
    // ... resto do código
  });
```

## 🚀 Deploy

### Build Docker

```bash
docker build -t wa-evolution-api:custom -f Docker/Dockerfile.custom .
```

### Test Local

```bash
docker run -p 8080:8080 \
  -e DATABASE_CONNECTION_URI="postgresql://..." \
  -e CACHE_REDIS_URI="redis://..." \
  -e AUTHENTICATION_API_KEY="your-key" \
  wa-evolution-api:custom
```

### AWS ECS

Use o workflow de deploy:

```bash
git tag v1.0.0-custom
git push origin v1.0.0-custom
```

O GitHub Actions vai:
1. Build da imagem usando `Dockerfile.custom`
2. Push para ECR
3. Deploy em staging (automático)
4. Deploy em produção (após aprovação)

## 📝 Checklist de Integração

- [ ] Copiar `.env.custom` para `.env`
- [ ] Configurar credenciais no `.env`
- [ ] Decidir quais features habilitar:
  - [ ] Health Checks Avançados
  - [ ] Rate Limiting
  - [ ] Métricas Prometheus
- [ ] Modificar `src/api/routes/index.router.ts` (se necessário)
- [ ] Testar localmente
- [ ] Build Docker
- [ ] Deploy

## ⚠️ Importante

### Zero Conflitos com Upstream

Todas as customizações estão em:
- ✅ Arquivos novos (`src/custom/*`)
- ✅ Configuração (`.env`)
- ⚠️ **Apenas** `src/api/routes/index.router.ts` precisa ser modificado (opcional)

### Ao Sincronizar com Upstream

```bash
./scripts/sync-upstream.sh v2.4.0
```

Possíveis conflitos:
- `src/api/routes/index.router.ts` (fácil de resolver - apenas reaplique as linhas customizadas)

Sem conflitos:
- `src/custom/*` (arquivos novos)
- `.env.custom` (arquivo novo)
- `CUSTOMIZATIONS.md` (arquivo novo)
- `Docker/Dockerfile.custom` (arquivo novo)

## 🔍 Troubleshooting

### "Cannot find module '../custom/routes/health.router'"

Você esqueceu de fazer build:

```bash
npm run build
```

### "Redis connection failed"

Verifique `CACHE_REDIS_URI` no `.env`.

### Rate limiting não funciona

Certifique-se que:
1. `RATE_LIMIT_ENABLED=true`
2. Redis está rodando
3. Middleware foi adicionado ao router

## 📚 Documentação

- Documentação completa: `src/custom/README.md`
- Registro de alterações: `CUSTOMIZATIONS.md`
- Configurações: `.env.custom`

## 🤝 Suporte

Para dúvidas sobre as customizações, consulte:
1. `src/custom/README.md` (documentação técnica)
2. `CUSTOMIZATIONS.md` (histórico de alterações)
3. PRD: `PRD_Evolution_API_Fork.md` (estratégia do fork)
