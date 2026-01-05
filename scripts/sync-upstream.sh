#!/bin/bash
# ============================================
# Sync with upstream Evolution API
# ============================================
# This script helps sync our fork with upstream releases
# Usage: ./scripts/sync-upstream.sh v2.4.0
# ============================================

set -e

UPSTREAM_REPO="https://github.com/EvolutionAPI/evolution-api.git"
TARGET_VERSION="${1:-}"

if [ -z "$TARGET_VERSION" ]; then
  echo "❌ Uso: $0 <versão>"
  echo "   Exemplo: $0 v2.4.0"
  exit 1
fi

echo "🔄 Sincronizando com upstream versão $TARGET_VERSION..."

# Verificar se upstream remote existe
if ! git remote | grep -q upstream; then
  echo "📎 Adicionando remote upstream..."
  git remote add upstream $UPSTREAM_REPO
fi

# Fetch upstream
echo "📥 Fetching upstream..."
git fetch upstream --tags

# Verificar se a tag existe
if ! git tag | grep -q "^$TARGET_VERSION$"; then
  echo "❌ Tag $TARGET_VERSION não encontrada no upstream"
  echo "📋 Tags disponíveis:"
  git tag | grep "^v2\." | tail -10
  exit 1
fi

# Criar branch de sync
SYNC_BRANCH="sync/$TARGET_VERSION-$(date +%Y%m%d)"
echo "🌿 Criando branch $SYNC_BRANCH..."
git checkout -b $SYNC_BRANCH

# Atualizar upstream-main
echo "📌 Atualizando upstream-main..."
git fetch upstream main:upstream-main --force

# Merge da tag específica
echo "🔀 Merging $TARGET_VERSION..."
git merge $TARGET_VERSION --no-edit || {
  echo ""
  echo "⚠️  Conflitos detectados!"
  echo "📝 Resolva os conflitos e execute:"
  echo "   git add ."
  echo "   git commit"
  echo "   git checkout main"
  echo "   git merge $SYNC_BRANCH"
  exit 1
}

echo ""
echo "✅ Merge concluído com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Revise as alterações: git diff main..$SYNC_BRANCH"
echo "   2. Execute os testes: npm test"
echo "   3. Atualize CUSTOMIZATIONS.md"
echo "   4. Crie PR: gh pr create -B main -H $SYNC_BRANCH"
echo ""
