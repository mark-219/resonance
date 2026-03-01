# Resonance

Self-hosted music library manager for seedbox workflows. Browse and organize music across remote seedboxes and local storage — without ever modifying source files.

## Features

- **Read-Only Seedbox Policy** — Never writes, moves, or deletes files on remote hosts
- **Remote File Browsing** — SFTP-based directory listing with SSH key auth and TOFU fingerprint verification
- **Library Management** — Organize music into libraries backed by remote or local storage
- **OIDC + Local Auth** — Any OpenID Connect provider, with local username/password fallback
- **Multi-User** — Admin, user, and read-only roles

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/) and [Git](https://git-scm.com/).

```bash
git clone https://github.com/mark-219/resonance.git
cd resonance
./deploy.sh
```

`deploy.sh` generates a `.env` with random secrets, builds containers, and starts everything.

Once running, create your admin account:

```bash
curl -X POST http://localhost:3100/api/users/setup \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "your-password-here"}'
```

Open `http://localhost:3100` and log in.

## Configuration

All configuration is in `.env`. See [`.env.example`](.env.example) for available options.

`deploy.sh` generates a `.env` with secure defaults on first run. Edit it to configure OIDC, SSH key paths, and music storage paths.

## Production

For production deployments, use the production overlay which adds resource limits, log rotation, and `restart: always`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

If serving over HTTPS (recommended), set `SECURE_COOKIES=true` in your `.env`.

For automated deployment with GitHub Actions, see [`scripts/setup-server.sh`](scripts/setup-server.sh).

## Development

Requires Node.js 20+ and npm.

```bash
# Start PostgreSQL and Redis
docker compose up db redis -d

# Install dependencies and start dev servers
npm install
npm run dev    # Server :3001, Client :3100
```

### Tests

```bash
cd server
npx vitest run          # All tests
npx vitest              # Watch mode
```

Tests use a separate `resonance_test` database. Configure via `TEST_DATABASE_URL` or it defaults to `postgresql://seedbox:devpass@localhost:5432/resonance_test`.

## License

[MIT](LICENSE)
