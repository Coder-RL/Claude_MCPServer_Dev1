#!/usr/bin/env node

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database/pg-pool.js';
import { logger } from '../shared/logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseMigrator {
  constructor() {
    this.migrationsPath = join(__dirname, '../database/migrations');
    this.lockTableName = 'migration_lock';
  }

  /**
   * Acquire migration lock to prevent concurrent migrations
   */
  async acquireLock() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ${this.lockTableName} (
          id INTEGER PRIMARY KEY DEFAULT 1,
          locked_at TIMESTAMP WITH TIME ZONE,
          locked_by VARCHAR(255),
          CONSTRAINT single_lock CHECK (id = 1)
        )
      `);

      const result = await db.query(`
        INSERT INTO ${this.lockTableName} (locked_at, locked_by) 
        VALUES (NOW(), $1)
        ON CONFLICT (id) DO UPDATE 
        SET locked_at = NOW(), locked_by = $1
        WHERE ${this.lockTableName}.locked_at < NOW() - INTERVAL '30 minutes'
        RETURNING locked_at
      `, [process.env.HOSTNAME || 'unknown']);

      if (result.rowCount === 0) {
        throw new Error('Migration is already in progress');
      }

      logger.info('Migration lock acquired');
      return true;
    } catch (error) {
      logger.error('Failed to acquire migration lock', { error: error.message });
      throw error;
    }
  }

  /**
   * Release migration lock
   */
  async releaseLock() {
    try {
      await db.query(`DELETE FROM ${this.lockTableName}`);
      logger.info('Migration lock released');
    } catch (error) {
      logger.error('Failed to release migration lock', { error: error.message });
    }
  }

  /**
   * Get list of executed migrations
   */
  async getExecutedMigrations() {
    try {
      const result = await db.query(`
        SELECT version, name, executed_at, checksum 
        FROM public.schema_migrations 
        ORDER BY version
      `);
      return result.rows;
    } catch (error) {
      // Table doesn't exist yet
      if (error.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get list of available migration files
   */
  getAvailableMigrations() {
    try {
      const files = readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();

      return files.map(file => {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
          throw new Error(`Invalid migration filename: ${file}`);
        }

        return {
          version: parseInt(match[1]),
          name: match[2],
          filename: file,
          path: join(this.migrationsPath, file)
        };
      });
    } catch (error) {
      logger.error('Failed to read migration files', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate checksum for migration content
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration) {
    const startTime = Date.now();
    
    try {
      logger.info(`Executing migration ${migration.version}: ${migration.name}`);
      
      const content = readFileSync(migration.path, 'utf8');
      const checksum = this.calculateChecksum(content);
      
      // Execute the migration in a transaction
      await db.transaction(async (client) => {
        // Execute the SQL
        await client.query(content);
        
        // Update migration tracking (if not already done by the migration)
        await client.query(`
          INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (version) DO UPDATE 
          SET executed_at = NOW(), execution_time_ms = $3, checksum = $4
        `, [migration.version, migration.name, Date.now() - startTime, checksum]);
      });

      const executionTime = Date.now() - startTime;
      logger.info(`Migration ${migration.version} completed`, { 
        executionTime,
        name: migration.name 
      });

      return { success: true, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Migration ${migration.version} failed`, {
        error: error.message,
        executionTime,
        name: migration.name
      });
      throw error;
    }
  }

  /**
   * Run pending migrations
   */
  async migrate() {
    let lockAcquired = false;
    
    try {
      // Test database connection
      const isConnected = await db.testConnection();
      if (!isConnected) {
        throw new Error('Database connection failed');
      }

      // Acquire lock
      await this.acquireLock();
      lockAcquired = true;

      // Get current state
      const executedMigrations = await this.getExecutedMigrations();
      const availableMigrations = this.getAvailableMigrations();
      
      const executedVersions = new Set(executedMigrations.map(m => m.version));
      const pendingMigrations = availableMigrations.filter(m => !executedVersions.has(m.version));

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return { executed: 0, migrations: [] };
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      // Execute migrations in order
      const results = [];
      for (const migration of pendingMigrations) {
        const result = await this.executeMigration(migration);
        results.push({
          version: migration.version,
          name: migration.name,
          ...result
        });
      }

      logger.info('All migrations completed successfully', {
        executed: results.length,
        totalTime: results.reduce((sum, r) => sum + r.executionTime, 0)
      });

      return { executed: results.length, migrations: results };
    } catch (error) {
      logger.error('Migration process failed', { error: error.message });
      throw error;
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
    }
  }

  /**
   * Show migration status
   */
  async status() {
    try {
      const isConnected = await db.testConnection();
      if (!isConnected) {
        throw new Error('Database connection failed');
      }

      const executedMigrations = await this.getExecutedMigrations();
      const availableMigrations = this.getAvailableMigrations();
      
      const executedVersions = new Set(executedMigrations.map(m => m.version));
      
      console.log('\n=== Migration Status ===\n');
      
      for (const migration of availableMigrations) {
        const status = executedVersions.has(migration.version) ? '✅' : '⏳';
        const executed = executedMigrations.find(m => m.version === migration.version);
        
        console.log(`${status} ${migration.version.toString().padStart(3, '0')}: ${migration.name}`);
        if (executed) {
          console.log(`    Executed: ${executed.executed_at}`);
        }
      }
      
      const pending = availableMigrations.length - executedMigrations.length;
      console.log(`\nTotal: ${availableMigrations.length} | Executed: ${executedMigrations.length} | Pending: ${pending}\n`);
      
    } catch (error) {
      logger.error('Failed to get migration status', { error: error.message });
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const migrator = new DatabaseMigrator();
  const command = process.argv[2];

  try {
    switch (command) {
      case 'status':
        await migrator.status();
        break;
      case 'migrate':
      default:
        await migrator.migrate();
        break;
    }
    process.exit(0);
  } catch (error) {
    logger.error('Migration command failed', { error: error.message });
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DatabaseMigrator };