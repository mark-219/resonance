# Resonance

Self-hosted music library manager for seedbox workflows. Browse, stream, and organize music across remote seedboxes and local storage — without ever modifying source files.

## Features

- **OIDC Authentication** — Any OpenID Connect provider, with local auth fallback
- **Remote File Browsing** — SFTP-based directory listing with SSH key management and TOFU fingerprint verification
- **Audio Streaming** — Stream from your seedbox via SFTP proxy with range request support
- **Format-Aware Quality Display** — Format badges (FLAC 24-bit, V0, V2, 320, etc.) with quality tier indicators
- **Virtual Playlists & Collections** — Organize music without altering files or directory structures
- **Read-Only Seedbox Policy** — Never writes, moves, or deletes files on remote hosts

## Quick Start

```bash
git clone https://github.com/mark-219/resonance.git
cd resonance
cp .env.example .env   # Edit with your settings
./deploy.sh
```

Frontend: `http://localhost:3100`
Backend: `http://localhost:3001`

## Development

```bash
npm install
npm run dev    # Starts both server and client in watch mode
```

Requires PostgreSQL and Redis running locally, or use Docker Compose:

```bash
docker compose up db redis -d
npm run dev
```

## Environment Variables

See [`.env.example`](.env.example) for configuration options including OIDC, database, and SSH key paths.

## License

[MIT](LICENSE)
