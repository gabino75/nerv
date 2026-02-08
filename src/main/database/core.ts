import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { migrations } from '../database-migrations'

/**
 * Core database functionality shared across all database modules.
 * This provides the base Database.Database instance and common utilities.
 */
export class DatabaseCore {
  protected db: Database.Database | null = null
  private dbPath: string = ''

  // Get the NERV data directory
  private getNervDataDir(): string {
    const homeDir = app.getPath('home')
    return join(homeDir, '.nerv')
  }

  // Initialize the database
  initialize(): void {
    const nervDir = this.getNervDataDir()

    // Ensure ~/.nerv directory exists
    if (!existsSync(nervDir)) {
      mkdirSync(nervDir, { recursive: true })
    }

    // Use a global state.db for now (can be per-project later)
    this.dbPath = join(nervDir, 'state.db')

    // Open database with WAL mode for better performance
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    // Run migrations
    this.runMigrations()
  }

  // Run pending migrations
  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Check current version
    let currentVersion = 0
    try {
      const result = this.db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
      currentVersion = result?.v || 0
    } catch {
      // Table doesn't exist yet, version is 0
    }

    // Run pending migrations
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

  // Run WAL checkpoint to flush WAL file into main database
  checkpoint(): void {
    if (this.db) {
      this.db.pragma('wal_checkpoint(TRUNCATE)')
    }
  }

  // Close database connection (with WAL checkpoint for clean shutdown)
  close(): void {
    if (this.db) {
      // Checkpoint WAL before closing to prevent corruption on unclean shutdown
      try {
        this.checkpoint()
      } catch (err) {
        console.error('[Database] WAL checkpoint failed during close:', err)
      }
      this.db.close()
      this.db = null
    }
  }

  // Generate a unique ID
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  // Ensure database is initialized
  protected ensureDb(): Database.Database {
    if (!this.db) throw new Error('Database not initialized')
    return this.db
  }

  // Get raw database handle for integrity checks (used by recovery module)
  getRawDb(): Database.Database | null {
    return this.db
  }
}
