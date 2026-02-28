#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/resonance}"
REPO="mark-219/resonance"
RUNNER_VERSION="2.322.0"
RUNNER_USER="resonance-runner"

echo "Resonance — Server Setup"
echo ""

# ─── Create dedicated runner user ─────────────────────────────────────

if id "$RUNNER_USER" &>/dev/null; then
  echo "[1/4] Runner user '$RUNNER_USER' exists"
else
  echo "[1/4] Creating runner user '$RUNNER_USER'..."
  sudo useradd -r -m -s /bin/bash "$RUNNER_USER"
  sudo usermod -aG docker "$RUNNER_USER"
fi

# ─── Clone repo ───────────────────────────────────────────────────────

if [ -d "$DEPLOY_PATH/.git" ]; then
  echo "[2/4] Repo exists at $DEPLOY_PATH"
else
  echo "[2/4] Cloning..."
  sudo mkdir -p "$DEPLOY_PATH"
  sudo chown "$RUNNER_USER:$RUNNER_USER" "$DEPLOY_PATH"
  sudo -u "$RUNNER_USER" git clone "https://github.com/${REPO}.git" "$DEPLOY_PATH"
fi

cd "$DEPLOY_PATH"

# ─── Generate .env ────────────────────────────────────────────────────

if [ -f .env ]; then
  echo "[3/4] .env exists — skipping"
else
  echo "[3/4] Generating .env..."
  DB_PASSWORD=$(openssl rand -hex 24)
  SESSION_SECRET=$(openssl rand -hex 32)
  SERVER_IP=$(hostname -I | awk '{print $1}')

  sudo -u "$RUNNER_USER" bash -c "cat > ${DEPLOY_PATH}/.env" <<EOF
DB_PASSWORD=${DB_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=http://${SERVER_IP}:3100/auth/callback
LOCAL_AUTH_ENABLED=true
CORS_ORIGIN=http://${SERVER_IP}:3100
SSH_KEY_DIR=/home/${RUNNER_USER}/.ssh
MUSIC_PATH=/mnt/music
EOF

  sudo chmod 600 "${DEPLOY_PATH}/.env"
  sudo chown "$RUNNER_USER:$RUNNER_USER" "${DEPLOY_PATH}/.env"
fi

# ─── Install GitHub Actions runner ────────────────────────────────────

RUNNER_DIR="${DEPLOY_PATH}/.runner"

if [ -f "${RUNNER_DIR}/.runner" ]; then
  echo "[4/4] Runner already configured"
else
  echo "[4/4] Installing runner..."
  echo ""
  echo "  Get a registration token from:"
  echo "  https://github.com/${REPO}/settings/actions/runners/new"
  echo ""
  read -rp "  Token: " RUNNER_TOKEN

  sudo mkdir -p "$RUNNER_DIR"
  sudo chown "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) RUNNER_ARCH="x64" ;;
    aarch64|arm64) RUNNER_ARCH="arm64" ;;
    *) echo "Unsupported: $ARCH"; exit 1 ;;
  esac

  RUNNER_TAR="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
  cd "$RUNNER_DIR"

  if [ ! -f "$RUNNER_TAR" ]; then
    sudo -u "$RUNNER_USER" curl -sL \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}" \
      -o "$RUNNER_TAR"
  fi
  sudo -u "$RUNNER_USER" tar xzf "$RUNNER_TAR"

  sudo -u "$RUNNER_USER" ./config.sh \
    --url "https://github.com/${REPO}" \
    --token "$RUNNER_TOKEN" \
    --name "apps-$(hostname)" \
    --labels "self-hosted,linux,resonance" \
    --work "${DEPLOY_PATH}/_work" \
    --unattended

  sudo ./svc.sh install "$RUNNER_USER"
  sudo ./svc.sh start

  cd "$DEPLOY_PATH"
fi

echo ""
echo "Done. Next steps:"
echo ""
echo "  1. gh variable set DEPLOY_PATH --body '${DEPLOY_PATH}'"
echo "  2. Create 'production' environment in GitHub settings"
echo "     - Add required reviewers"
echo "     - Restrict to 'main' branch"
echo "     - Set DEPLOY_PATH as environment variable"
echo "  3. Configure fork PR workflow approval:"
echo "     Settings → Actions → General → Fork pull request workflows"
echo "     → Require approval for all outside collaborators"
echo "  4. Edit .env: sudo -u ${RUNNER_USER} nano ${DEPLOY_PATH}/.env"
echo ""
