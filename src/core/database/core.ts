/**
 * NERV Core Database - Base initialization and utilities
 *
 * Platform-agnostic database core for NERV.
 * This module can be used by both the CLI and Electron app.
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { migrations } from '../migrations.js'
import { getDatabasePath, ensureNervDir } from '../platform.js'

export interface DatabaseServiceConfig {
  /** Path to the SQLite database file. If not provided, uses default (~/.nerv/state.db) */
  dbPath?: string
  /** If true, uses an in-memory database (for testing) */
  inMemory?: boolean
}

/**
 * Base database class with initialization and migration logic.
 */
export class DatabaseCore {
  protected db: Database.Database | null = null
  protected dbPath: string = ''

  constructor(protected config: DatabaseServiceConfig = {}) {}

  initialize(): void {
    if (this.config.inMemory) {
      this.db = new Database(':memory:')
      this.dbPath = ':memory:'
    } else {
      this.dbPath = this.config.dbPath || getDatabasePath()

      const parentDir = dirname(this.dbPath)
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      ensureNervDir()
      this.db = new Database(this.dbPath)
    }

    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.runMigrations()
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized')

    let currentVersion = 0
    try {
      const result = this.db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
      currentVersion = result?.v || 0
    } catch {
      // Table doesn't exist yet, version is 0
    }

    const pending = migrations.filter(m => m.version > currentVersion)

    if (pending.length > 0) {
      const transaction = this.db.transaction(() => {
        for (const migration of pending) {
          console.log(`Running migration ${migration.version}: ${migration.name}`)
          this.db!.exec(migration.up)
          this.db!.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
        }
      })
      transaction()
    }
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  getDbPath(): string {
    return this.dbPath
  }

  isInitialized(): boolean {
    return this.db !== null
  }

  protected ensureDb(): Database.Database {
    if (!this.db) throw new Error('Database not initialized')
    return this.db
  }

  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}
