/**
 * NERV Log Collector Utility
 *
 * Captures logs from all NERV components during E2E tests:
 * - Electron main process
 * - Renderer process
 * - Claude Code terminal output
 * - MCP server output
 * - Hook binary output
 * - Database audit log
 *
 * Usage:
 *   const collector = new NervLogCollector('test-name');
 *   await collector.start();
 *   // ... run test ...
 *   await collector.stop();
 *   collector.saveAll();
 */

import fs from 'fs';
import path from 'path';
import { Page, ElectronApplication } from '@playwright/test';

export interface LogEntry {
  timestamp: number;
  source: LogSource;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export type LogSource =
  | 'electron-main'
  | 'renderer'
  | 'claude-terminal'
  | 'mcp-server'
  | 'hook-binary'
  | 'database'
  | 'test';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface CollectorConfig {
  outputDir: string;
  captureScreenshots: boolean;
  captureDatabase: boolean;
  maxLogSize: number; // Max bytes per log file
}

const DEFAULT_CONFIG: CollectorConfig = {
  outputDir: path.join(process.cwd(), 'test-results', 'claude-integration'),
  captureScreenshots: true,
  captureDatabase: true,
  maxLogSize: 10 * 1024 * 1024, // 10MB
};

export class NervLogCollector {
  private testName: string;
  private config: CollectorConfig;
  private logs: LogEntry[] = [];
  private startTime: number = 0;
  private app?: ElectronApplication;
  private window?: Page;
  private terminalOutputBuffer: string = '';
  private pollingInterval?: NodeJS.Timeout;

  constructor(testName: string, config: Partial<CollectorConfig> = {}) {
    this.testName = testName;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Start collecting logs
   */
  async start(app: ElectronApplication, window: Page): Promise<void> {
    this.app = app;
    this.window = window;
    this.startTime = Date.now();
    this.logs = [];

    this.log('info', 'test', `Starting log collection for: ${this.testName}`);

    // Set up console listeners
    this.setupConsoleListeners();

    // Start polling for terminal output
    this.startTerminalPolling();

    // Log initial state
    await this.captureInitialState();
  }

  /**
   * Stop collecting logs
   */
  async stop(): Promise<void> {
    this.log('info', 'test', 'Stopping log collection');

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Capture final state
    await this.captureFinalState();
  }

  /**
   * Add a log entry
   */
  log(level: LogLevel, source: LogSource, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: Date.now() - this.startTime,
      source,
      level,
      message,
      metadata,
    };

    this.logs.push(entry);

    // Also print to console for real-time feedback
    const elapsed = (entry.timestamp / 1000).toFixed(2);
    const prefix = `[+${elapsed}s] [${level.toUpperCase()}] [${source}]`;
    console.log(`${prefix} ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);
  }

  /**
   * Save all collected logs to files
   */
  saveAll(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${this.testName}-${timestamp}`;

    // Save main log file
    this.saveMainLog(baseFilename);

    // Save logs by source
    this.saveLogsBySource(baseFilename);

    // Save terminal output
    this.saveTerminalOutput(baseFilename);

    // Save summary
    this.saveSummary(baseFilename);

    console.log(`\nLogs saved to: ${this.config.outputDir}`);
    console.log(`  - ${baseFilename}.log (main)`);
    console.log(`  - ${baseFilename}-by-source/`);
  }

  /**
   * Get logs filtered by source
   */
  getLogsForSource(source: LogSource): LogEntry[] {
    return this.logs.filter(l => l.source === source);
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.logs.filter(l => l.level === 'error').length;
  }

  /**
   * Get terminal output
   */
  getTerminalOutput(): string {
    return this.terminalOutputBuffer;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setupConsoleListeners(): void {
    if (!this.app || !this.window) return;

    // Electron main process console
    this.app.on('console', (msg) => {
      this.log('debug', 'electron-main', msg.text());
    });

    // Renderer console
    this.window.on('console', (msg) => {
      const level = msg.type() === 'error' ? 'error' :
                    msg.type() === 'warning' ? 'warn' : 'debug';
      this.log(level as LogLevel, 'renderer', msg.text());
    });

    // Page errors
    this.window.on('pageerror', (error) => {
      this.log('error', 'renderer', `Page error: ${error.message}`);
    });
  }

  private startTerminalPolling(): void {
    if (!this.window) return;

    this.pollingInterval = setInterval(async () => {
      try {
        const terminal = await this.window!.locator(
          '[data-testid="terminal-output"], .xterm-screen, .terminal'
        ).first();

        if (await terminal.isVisible().catch(() => false)) {
          const currentOutput = await terminal.textContent().catch(() => '');
          if (currentOutput && currentOutput !== this.terminalOutputBuffer) {
            const newContent = currentOutput.slice(this.terminalOutputBuffer.length);
            this.terminalOutputBuffer = currentOutput;

            if (newContent.trim()) {
              this.log('info', 'claude-terminal', newContent);
            }
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 500);
  }

  private async captureInitialState(): Promise<void> {
    if (!this.window || !this.config.captureDatabase) return;

    try {
      const state = await this.window.evaluate(async () => {
        // @ts-expect-error - window.api is defined by preload
        const api = window.api;
        if (!api) return null;

        return {
          projects: await api.db.projects.getAll(),
          pendingApprovals: await api.db.approvals.getPending(),
        };
      });

      if (state) {
        this.log('info', 'database', `Initial state: ${JSON.stringify(state).substring(0, 500)}`);
      }
    } catch (e) {
      this.log('warn', 'database', `Could not capture initial state: ${e}`);
    }
  }

  private async captureFinalState(): Promise<void> {
    if (!this.window) return;

    // Take screenshot
    if (this.config.captureScreenshots) {
      try {
        const screenshotPath = path.join(
          this.config.outputDir,
          `${this.testName}-final-${Date.now()}.png`
        );
        await this.window.screenshot({ path: screenshotPath });
        this.log('info', 'test', `Final screenshot saved: ${screenshotPath}`);
      } catch (e) {
        this.log('warn', 'test', `Could not take final screenshot: ${e}`);
      }
    }

    // Capture database state
    if (this.config.captureDatabase) {
      try {
        const state = await this.window.evaluate(async () => {
          // @ts-expect-error - window.api is defined by preload
          const api = window.api;
          if (!api) return null;

          const projects = await api.db.projects.getAll();
          const projectsWithTasks = await Promise.all(
            projects.map(async (p: { id: string }) => ({
              ...p,
              tasks: await api.db.tasks.getForProject(p.id)
            }))
          );

          return {
            projects: projectsWithTasks,
            approvals: await api.db.approvals.getAll(),
          };
        });

        if (state) {
          const statePath = path.join(
            this.config.outputDir,
            `${this.testName}-final-state.json`
          );
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
          this.log('info', 'database', `Final state saved: ${statePath}`);
        }
      } catch (e) {
        this.log('warn', 'database', `Could not capture final state: ${e}`);
      }
    }
  }

  private saveMainLog(baseFilename: string): void {
    const logPath = path.join(this.config.outputDir, `${baseFilename}.log`);
    const content = this.logs.map(entry => {
      const time = `+${(entry.timestamp / 1000).toFixed(2)}s`;
      const level = entry.level.toUpperCase().padEnd(5);
      const source = entry.source.padEnd(15);
      const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
      return `${time} [${level}] [${source}] ${entry.message}${meta}`;
    }).join('\n');

    fs.writeFileSync(logPath, content);
  }

  private saveLogsBySource(baseFilename: string): void {
    const sourceDir = path.join(this.config.outputDir, `${baseFilename}-by-source`);
    fs.mkdirSync(sourceDir, { recursive: true });

    const sources = new Set(this.logs.map(l => l.source));
    for (const source of sources) {
      const sourceLogs = this.logs.filter(l => l.source === source);
      const content = sourceLogs.map(entry => {
        const time = `+${(entry.timestamp / 1000).toFixed(2)}s`;
        return `${time} [${entry.level}] ${entry.message}`;
      }).join('\n');

      fs.writeFileSync(path.join(sourceDir, `${source}.log`), content);
    }
  }

  private saveTerminalOutput(baseFilename: string): void {
    if (this.terminalOutputBuffer) {
      const terminalPath = path.join(this.config.outputDir, `${baseFilename}-terminal.txt`);
      fs.writeFileSync(terminalPath, this.terminalOutputBuffer);
    }
  }

  private saveSummary(baseFilename: string): void {
    const duration = (Date.now() - this.startTime) / 1000;
    const errorCount = this.getErrorCount();
    const warnCount = this.logs.filter(l => l.level === 'warn').length;

    const summary = `# Log Summary: ${this.testName}

**Duration**: ${duration.toFixed(2)}s
**Total Log Entries**: ${this.logs.length}
**Errors**: ${errorCount}
**Warnings**: ${warnCount}

## Log Sources

| Source | Count |
|--------|-------|
${Array.from(new Set(this.logs.map(l => l.source)))
  .map(s => `| ${s} | ${this.logs.filter(l => l.source === s).length} |`)
  .join('\n')}

## Errors

${this.logs.filter(l => l.level === 'error').map(e =>
  `- [+${(e.timestamp/1000).toFixed(2)}s] [${e.source}] ${e.message}`
).join('\n') || 'None'}

## Files Generated

- ${baseFilename}.log - All logs
- ${baseFilename}-by-source/ - Logs split by source
- ${baseFilename}-terminal.txt - Claude terminal output
- ${baseFilename}-final-state.json - Final database state
- ${baseFilename}-final-*.png - Screenshots
`;

    fs.writeFileSync(
      path.join(this.config.outputDir, `${baseFilename}-SUMMARY.md`),
      summary
    );
  }
}

/**
 * Convenience function to create and start a collector
 */
export async function createLogCollector(
  testName: string,
  app: ElectronApplication,
  window: Page,
  config?: Partial<CollectorConfig>
): Promise<NervLogCollector> {
  const collector = new NervLogCollector(testName, config);
  await collector.start(app, window);
  return collector;
}
