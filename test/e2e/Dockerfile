# NERV Claude Integration Test Container
#
# Pre-built environment with Electron, native modules, and dependencies.
# Test files are mounted at runtime - no rebuild needed when tests change.
#
# Build once:
#   docker build -t nerv-e2e -f test/e2e/Dockerfile .
#
# Run tests (mounts current directory):
#   docker run --rm -v $(pwd):/app/host:ro -e NERV_MOCK_CLAUDE=true nerv-e2e
#
# The container copies test files from /app/host at runtime, keeping
# the pre-built node_modules and native binaries intact.

FROM mcr.microsoft.com/playwright:v1.50.0-noble

# Install additional dependencies including ffmpeg for screen recording
RUN apt-get update && apt-get install -y \
    xvfb \
    build-essential \
    python3 \
    python3-setuptools \
    curl \
    jq \
    ffmpeg \
    x11-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code || echo "Claude Code install skipped (may need auth)"

# Set up working directory
WORKDIR /app

# ============================================================
# LAYER 1: Dependencies (changes rarely, slow to build)
# ============================================================
COPY package*.json ./

RUN npm ci

# Install matching Electron version and rebuild native modules
# Must use Electron 35+ for import.meta.dirname support (Node.js 20.11+)
RUN rm -rf node_modules/electron node_modules/.cache && \
    npm install electron@35.0.0 --save-dev --force && \
    npx @electron/rebuild -f -m . --only node-pty,better-sqlite3

# ============================================================
# LAYER 2: Build config files (needed for npm run build)
# ============================================================
COPY tsconfig*.json ./
COPY electron.vite.config.ts ./
COPY svelte.config.js ./
COPY postcss.config.js ./

# Create directories
RUN mkdir -p /app/test-results /root/.nerv /app/src /app/resources /app/test /app/scripts

# Environment variables
ENV NODE_ENV=test
ENV NERV_TEST_MODE=true
ENV NERV_LOG_LEVEL=debug
ENV DISPLAY=:99
ENV ELECTRON_DISABLE_GPU=true
ENV NERV_MOCK_CLAUDE=true

# Volume mount points
# - /root/.nerv: NERV database and config
# - /root/.anthropic: Anthropic API credentials
# - /root/.claude: Claude CLI authentication (OAuth tokens)
VOLUME ["/app/test-results", "/root/.nerv", "/root/.anthropic", "/root/.claude", "/app/host"]

# Entry point that syncs from mounted host and runs tests
COPY test/e2e/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npm", "run", "test:e2e:local"]
