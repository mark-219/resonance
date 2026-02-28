#!/usr/bin/env bash
set -euo pipefail

# ─── Resonance Deploy Script ─────────────────────────────────────────
# Usage:
#   ./deploy.sh          Start all services
#   ./deploy.sh --down   Stop all services
#   ./deploy.sh --logs   Follow logs

case "${1:-}" in
  --down)
    docker compose down
    exit 0
    ;;
  --logs)
    docker compose logs -f
    exit 0
    ;;
esac

# Generate .env if it doesn't exist
if [ ! -f .env ]; then
  echo "Generating .env with random secrets..."
  DB_PASSWORD=$(openssl rand -hex 16)
  SESSION_SECRET=$(openssl rand -hex 32)

  cat > .env <<EOF
DB_PASSWORD=${DB_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
LOCAL_AUTH_ENABLED=true
CORS_ORIGIN=http://localhost:3100
SSH_KEY_DIR=~/.ssh
MUSIC_PATH=/tmp/music
EOF

  echo ".env created. Edit it to configure OIDC and paths."
fi

# Build and start
docker compose up --build -d

echo ""
echo "  resonance is running:"
echo "    Frontend → http://localhost:3100"
echo "    Backend  → http://localhost:3001"
echo ""
echo "  First run? Bootstrap an admin:"
echo "    curl -X POST http://localhost:3001/api/users/setup \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"username\": \"admin\", \"password\": \"your-password\"}'"
echo ""
