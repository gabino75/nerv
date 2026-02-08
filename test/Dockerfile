# NERV E2E Test Environment
# Ubuntu 24.04 with Node.js 20, Git, and headless Electron support

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    # Electron dependencies
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2t64 \
    # Virtual display for headless testing
    xvfb \
    # Playwright dependencies
    libwoff1 \
    libopus0 \
    libwebpdemux2 \
    libharfbuzz-icu0 \
    libenchant-2-2 \
    libsecret-1-0 \
    libhyphen0 \
    libmanette-0.2-0 \
    libflite1 \
    libgles2 \
    gstreamer1.0-libav \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Verify installations
RUN node --version && npm --version && git --version

# Install Claude Code CLI globally
# Note: This requires authentication; the ~/.claude directory will be mounted
RUN npm install -g @anthropic-ai/claude-code || echo "Claude Code CLI install skipped - will be mounted from host"

# Install Playwright
RUN npm install -g playwright
RUN npx playwright install --with-deps chromium

# Create working directories
RUN mkdir -p /app /fixtures /test-results

WORKDIR /app

# Set display for headless Electron testing
ENV DISPLAY=:99

# Entry point script to start Xvfb and run tests
COPY test/scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
