# Releasing

This guide covers NERV's release process and distribution.

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` with changes
3. Run all tests:
   ```bash
   npm run test:unit
   powershell -File test/scripts/run-e2e.ps1 -Suite all
   ```
4. Build production artifacts:
   ```bash
   npm run build
   ```
5. Create a GitHub release with tag `v<version>` and attach binaries

## Version Scheme

NERV follows [Semantic Versioning](https://semver.org/):

- **Major** (`X.0.0`): Breaking changes to CLI, config format, or database schema
- **Minor** (`0.X.0`): New features, new CLI commands, non-breaking additions
- **Patch** (`0.0.X`): Bug fixes, performance improvements, documentation updates

## Package Formats

| Platform | Format | Installer |
|----------|--------|-----------|
| Windows | `.exe` | NSIS installer |
| macOS | `.dmg` | DMG with code signing |
| Linux | `.AppImage`, `.deb` | AppImage (portable), deb (Debian) |

Each platform package includes:
- Electron app
- `nerv-hook` binary (platform-specific)
- MCP server binaries (if any)

## Release Channels

| Channel | Description | Auto-update |
|---------|-------------|-------------|
| `stable` | Production releases (v1.0.0, v1.1.0) | Default |
| `beta` | Pre-release testing (v1.2.0-beta.1) | Opt-in |
| `alpha` | Bleeding edge (v1.2.0-alpha.3) | Opt-in |

Users can switch channels:

```bash
nerv config set updates.channel beta
```

## Auto-Update

NERV uses `electron-updater` with GitHub Releases for automatic updates.

### Update Flow

1. **App Start** — Check for updates in background
2. **Update Available** — Download in background, show notification
3. **User Action** — Restart now, install later, or skip version
4. **Install** — On quit, replace files and restart

### Update Settings

In `~/.nerv/config.json`:

```json
{
  "updates": {
    "autoCheck": true,
    "autoDownload": true,
    "autoInstall": false,
    "checkInterval": 3600000,
    "channel": "stable",
    "allowDowngrade": false
  }
}
```

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| CI | Push/PR to main | lint, typecheck, unit tests, build Go hooks (all platforms), E2E tests |
| Release | Tag `v*` | Build + publish installers for all platforms |
| Docs | Push to main (docs-site/**) | Build and deploy VitePress docs to GitHub Pages |

### Hook Build Matrix

The Go permission hook binary is built for all platform/arch combinations:

- linux/amd64, linux/arm64
- darwin/amd64, darwin/arm64
- windows/amd64, windows/arm64

### Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production releases |
| `develop` | Development builds |
| `feature/*` | PR builds |
