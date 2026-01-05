# Customizações do Fork

Este documento registra todas as alterações feitas em relação ao upstream.

## Versão Base
- Upstream: EvolutionAPI/evolution-api
- Versão base: v2.3.7
- Data do fork: 2026-01-05

## Alterações

### Configurações (src/config/)
| Arquivo | Alteração | Motivo |
|---------|-----------|--------|
| .env.custom | Configurações customizadas padrão | Desabilitar integrações não usadas, configurar webhooks globais, otimizar para AWS |

### Código Removido
| Diretório | Motivo |
|-----------|--------|
| _Pendente_ | _Pendente_ |

### Código Adicionado
| Arquivo | Descrição |
|---------|-----------|
| scripts/sync-upstream.sh | Script para sincronização com upstream |
| .github/workflows/deploy.yml | Pipeline de CI/CD para deploy em AWS ECS |

### Docker
| Arquivo | Alteração |
|---------|-----------|
| Docker/Dockerfile.custom | Build multi-stage otimizado, non-root user, health checks |

## Como Sincronizar com Upstream

```bash
./scripts/sync-upstream.sh v2.4.0
```

## Histórico de Sincronizações
| Data | Versão Upstream | PR | Notas |
|------|-----------------|-----|-------|
| 2026-01-05 | v2.3.7 | - | Fork inicial |
