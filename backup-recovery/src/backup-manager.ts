import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

export interface BackupJob {
  id: string;
  name: string;
  description: string;
  type: 'full' | 'incremental' | 'differential' | 'snapshot';
  sources: BackupSource[];
  destination: BackupDestination;
  schedule: BackupSchedule;
  retention: RetentionPolicy;
  compression: CompressionConfig;
  encryption: EncryptionConfig;
  filters: BackupFilter[];
  priority: number;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  statistics: BackupStatistics;
  created: Date;
  modified: Date;
}

export interface BackupSource {
  id: string;
  type: 'filesystem' | 'database' | 'object-storage' | 'application-data' | 'configuration';
  path: string;
  credentials?: any;
  metadata: Record<string, any>;
  excludePatterns?: string[];
  includePatterns?: string[];
  lastBackup?: Date;
  changeDetection: 'timestamp' | 'checksum' | 'both';
}

export interface BackupDestination {
  id: string;
  type: 'local' | 'network' | 's3' | 'azure' | 'gcp' | 'ftp' | 'sftp';
  location: string;
  credentials?: any;
  region?: string;
  storageClass?: string;
  replication?: ReplicationConfig;
  verification: boolean;
  metadata: Record<string, any>;
}

export interface ReplicationConfig {
  enabled: boolean;
  targets: BackupDestination[];
  strategy: 'sync' | 'async' | 'geo-redundnt';
  consistency: 'eventual' | 'strong';
}

export interface BackupSchedule {
  enabled: boolean;
  type: 'interval' | 'cron' | 'event-driven';
  interval?: number; // minutes
  cron?: string;
  timezone?: string;
  events?: string[];
  maxConcurrentJobs: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number; // seconds
  maxDelay: number; // seconds
  backoffMultiplier: number;
  retryOnFailures: string[];
}

export interface RetentionPolicy {
  type: 'time-based' | 'count-based' | 'size-based' | 'hybrid';
  timeRetention?: {
    daily: number;
    weekly: number;
    monthly: number;
    yearly: number;
  };
  countRetention?: {
    maxCount: number;
    minCount: number;
  };
  sizeRetention?: {
    maxSize: number; // bytes
    autoCleanup: boolean;
  };
  customRules?: RetentionRule[];
}

export interface RetentionRule {
  id: string;
  name: string;
  condition: string;
  action: 'keep' | 'delete' | 'archive';
  parameters: Record<string, any>;
}

export interface CompressionConfig {
  enabled: boolean;
  algorithm: 'gzip' | 'bzip2' | 'lz4' | 'zstd' | 'xz';
  level: number; // 1-9
  splitSize?: number; // bytes
  parallelCompression: boolean;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';
  keyDerivation: 'pbkdf2' | 'scrypt' | 'argon2';
  keySource: 'password' | 'keyfile' | 'kms' | 'vault';
  keyLocation?: string;
  encryptMetadata: boolean;
}

export interface BackupFilter {
  id: string;
  type: 'include' | 'exclude';
  pattern: string;
  patternType: 'glob' | 'regex' | 'path';
  caseSensitive: boolean;
  enabled: boolean;
}

export interface BackupStatistics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  averageDuration: number; // seconds
  lastDuration?: number; // seconds
  totalDataBackedUp: number; // bytes
  lastBackupSize?: number; // bytes
  compressionRatio: number;
  transferRate: number; // bytes/second
  errorCount: number;
  warningCount: number;
}

export interface BackupExecution {
  id: string;
  jobId: string;
  type: 'full' | 'incremental' | 'differential' | 'snapshot';
  startTime: Date;
  endTime?: Date;
  duration?: number; // seconds
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: BackupProgress;
  statistics: ExecutionStatistics;
  logs: BackupLog[];
  errors: BackupError[];
  warnings: BackupWarning[];
  metadata: BackupMetadata;
}

export interface BackupProgress {
  phase: 'preparing' | 'scanning' | 'backing-up' | 'verifying' | 'finalizing';
  overallProgress: number; // 0-100
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  bytesProcessed: number;
  totalBytes: number;
  transferRate: number; // bytes/second
  estimatedTimeRemaining?: number; // seconds
}

export interface ExecutionStatistics {
  filesBackedUp: number;
  filesSkipped: number;
  filesChanged: number;
  filesDeleted: number;
  bytesTransferred: number;
  bytesCompressed: number;
  compressionRatio: number;
  encryptionTime: number;
  compressionTime: number;
  transferTime: number;
  verificationTime: number;
}

export interface BackupLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  component: string;
  metadata?: Record<string, any>;
}

export interface BackupError {
  timestamp: Date;
  code: string;
  message: string;
  source: string;
  stackTrace?: string;
  recoverable: boolean;
  metadata?: Record<string, any>;
}

export interface BackupWarning {
  timestamp: Date;
  code: string;
  message: string;
  source: string;
  metadata?: Record<string, any>;
}

export interface BackupMetadata {
  backupId: string;
  jobId: string;
  version: string;
  timestamp: Date;
  type: string;
  sources: string[];
  destination: string;
  encryption: boolean;
  compression: boolean;
  checksum: string;
  size: number;
  fileCount: number;
  dependencies?: string[];
  tags: Record<string, string>;
}

export interface RestoreJob {
  id: string;
  name: string;
  backupId: string;
  targetLocation: string;
  restoreType: 'full' | 'partial' | 'point-in-time';
  restoreOptions: RestoreOptions;
  filters?: BackupFilter[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: RestoreProgress;
  started?: Date;
  completed?: Date;
  errors: BackupError[];
  warnings: BackupWarning[];
}

export interface RestoreOptions {
  overwriteExisting: boolean;
  preservePermissions: boolean;
  preserveTimestamps: boolean;
  restoreACLs: boolean;
  pointInTime?: Date;
  includeDeletedFiles: boolean;
  verifyAfterRestore: boolean;
  targetMapping?: Record<string, string>;
}

export interface RestoreProgress {
  phase: 'preparing' | 'restoring' | 'verifying' | 'finalizing';
  overallProgress: number; // 0-100
  currentFile?: string;
  filesRestored: number;
  totalFiles: number;
  bytesRestored: number;
  totalBytes: number;
  transferRate: number; // bytes/second
  estimatedTimeRemaining?: number; // seconds
}

export class BackupManager extends EventEmitter {
  private jobs = new Map<string, BackupJob>();
  private executions = new Map<string, BackupExecution>();
  private restoreJobs = new Map<string, RestoreJob>();
  private schedulerInterval: NodeJS.Timeout | null = null;
  private activeExecutions = new Set<string>();
  private encryptionKeys = new Map<string, Buffer>();
  private checksumCache = new Map<string, string>();
  private changeDetectionCache = new Map<string, Map<string, string>>();

  constructor(private basePath: string = './backups') {
    super();
    this.ensureBasePath();
    this.startScheduler();
    this.loadEncryptionKeys();
  }

  private ensureBasePath(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  private loadEncryptionKeys(): void {
    // Load or generate master encryption key
    const keyPath = join(this.basePath, '.master-key');
    
    if (existsSync(keyPath)) {
      try {
        const keyData = require('fs').readFileSync(keyPath);
        this.encryptionKeys.set('master', keyData);
      } catch (error) {
        // Generate new key if loading fails
        this.generateMasterKey();
      }
    } else {
      this.generateMasterKey();
    }
  }

  private generateMasterKey(): void {
    const masterKey = crypto.randomBytes(32);
    const keyPath = join(this.basePath, '.master-key');
    
    try {
      require('fs').writeFileSync(keyPath, masterKey, { mode: 0o600 });
      this.encryptionKeys.set('master', masterKey);
    } catch (error) {
      console.warn('Failed to save master encryption key:', error);
    }
  }

  createBackupJob(config: Omit<BackupJob, 'id' | 'status' | 'statistics' | 'created' | 'modified'>): string {
    const job: BackupJob = {
      id: crypto.randomUUID(),
      status: 'idle',
      statistics: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        cancelledRuns: 0,
        averageDuration: 0,
        totalDataBackedUp: 0,
        compressionRatio: 0,
        transferRate: 0,
        errorCount: 0,
        warningCount: 0
      },
      created: new Date(),
      modified: new Date(),
      ...config
    };

    this.jobs.set(job.id, job);
    this.scheduleNextRun(job);
    
    this.emit('backup-job-created', job);
    return job.id;
  }

  updateBackupJob(jobId: string, updates: Partial<BackupJob>): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    Object.assign(job, updates);
    job.modified = new Date();
    
    if (updates.schedule) {
      this.scheduleNextRun(job);
    }

    this.emit('backup-job-updated', job);
    return true;
  }

  deleteBackupJob(jobId: string, deleteBackups: boolean = false): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    // Cancel if running
    if (job.status === 'running') {
      this.cancelBackupJob(jobId);
    }

    // Delete backup files if requested
    if (deleteBackups) {
      this.deleteJobBackups(jobId);
    }

    this.jobs.delete(jobId);
    this.emit('backup-job-deleted', { jobId, deleteBackups });
    return true;
  }

  async executeBackupJob(jobId: string, force: boolean = false): Promise<string> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Backup job not found: ${jobId}`);
    }

    if (!force && job.status === 'running') {
      throw new Error(`Backup job is already running: ${jobId}`);
    }

    if (!job.enabled && !force) {
      throw new Error(`Backup job is disabled: ${jobId}`);
    }

    const execution: BackupExecution = {
      id: crypto.randomUUID(),
      jobId,
      type: job.type,
      startTime: new Date(),
      status: 'running',
      progress: {
        phase: 'preparing',
        overallProgress: 0,
        filesProcessed: 0,
        totalFiles: 0,
        bytesProcessed: 0,
        totalBytes: 0,
        transferRate: 0
      },
      statistics: {
        filesBackedUp: 0,
        filesSkipped: 0,
        filesChanged: 0,
        filesDeleted: 0,
        bytesTransferred: 0,
        bytesCompressed: 0,
        compressionRatio: 0,
        encryptionTime: 0,
        compressionTime: 0,
        transferTime: 0,
        verificationTime: 0
      },
      logs: [],
      errors: [],
      warnings: [],
      metadata: {
        backupId: crypto.randomUUID(),
        jobId,
        version: '1.0',
        timestamp: new Date(),
        type: job.type,
        sources: job.sources.map(s => s.path),
        destination: job.destination.location,
        encryption: job.encryption.enabled,
        compression: job.compression.enabled,
        checksum: '',
        size: 0,
        fileCount: 0,
        tags: {}
      }
    };

    this.executions.set(execution.id, execution);
    this.activeExecutions.add(execution.id);
    job.status = 'running';

    this.emit('backup-started', execution);

    try {
      await this.performBackup(execution, job);
      
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      
      job.status = 'completed';
      job.lastRun = execution.endTime;
      job.statistics.totalRuns++;
      job.statistics.successfulRuns++;
      job.statistics.lastDuration = execution.duration;
      job.statistics.lastBackupSize = execution.statistics.bytesTransferred;
      
      this.scheduleNextRun(job);
      this.emit('backup-completed', execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      
      execution.errors.push({
        timestamp: new Date(),
        code: 'BACKUP_FAILED',
        message: (error as Error).message,
        source: 'backup-manager',
        stackTrace: (error as Error).stack,
        recoverable: false
      });

      job.status = 'failed';
      job.statistics.totalRuns++;
      job.statistics.failedRuns++;
      job.statistics.errorCount++;
      
      this.emit('backup-failed', { execution, error: (error as Error).message });
      throw error;

    } finally {
      this.activeExecutions.delete(execution.id);
    }

    return execution.id;
  }

  private async performBackup(execution: BackupExecution, job: BackupJob): Promise<void> {
    // Phase 1: Preparation
    execution.progress.phase = 'preparing';
    this.addLog(execution, 'info', 'Starting backup preparation');
    
    await this.prepareBackupDestination(job.destination);
    
    // Phase 2: Scanning
    execution.progress.phase = 'scanning';
    this.addLog(execution, 'info', 'Scanning source files');
    
    const filesToBackup = await this.scanSources(job.sources, job.filters, execution);
    execution.progress.totalFiles = filesToBackup.length;
    execution.progress.totalBytes = filesToBackup.reduce((sum, f) => sum + f.size, 0);

    // Phase 3: Backup
    execution.progress.phase = 'backing-up';
    this.addLog(execution, 'info', `Backing up ${filesToBackup.length} files`);
    
    const backupPath = this.generateBackupPath(job, execution);
    await this.performFileBackup(filesToBackup, backupPath, job, execution);

    // Phase 4: Verification
    if (job.destination.verification) {
      execution.progress.phase = 'verifying';
      this.addLog(execution, 'info', 'Verifying backup integrity');
      await this.verifyBackup(backupPath, execution);
    }

    // Phase 5: Finalization
    execution.progress.phase = 'finalizing';
    this.addLog(execution, 'info', 'Finalizing backup');
    
    await this.finalizeBackup(execution, job);
    await this.applyRetentionPolicy(job);
    
    execution.progress.overallProgress = 100;
    this.addLog(execution, 'info', 'Backup completed successfully');
  }

  private async scanSources(sources: BackupSource[], filters: BackupFilter[], execution: BackupExecution): Promise<FileInfo[]> {
    const allFiles: FileInfo[] = [];
    
    for (const source of sources) {
      try {
        const sourceFiles = await this.scanSource(source, filters, execution);
        allFiles.push(...sourceFiles);
      } catch (error) {
        execution.errors.push({
          timestamp: new Date(),
          code: 'SOURCE_SCAN_FAILED',
          message: `Failed to scan source ${source.path}: ${(error as Error).message}`,
          source: source.path,
          recoverable: false
        });
      }
    }

    return allFiles;
  }

  private async scanSource(source: BackupSource, filters: BackupFilter[], execution: BackupExecution): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    
    switch (source.type) {
      case 'filesystem':
        return this.scanFilesystem(source.path, filters, source);
      
      case 'database':
        return this.scanDatabase(source, execution);
      
      case 'object-storage':
        return this.scanObjectStorage(source, execution);
      
      case 'application-data':
        return this.scanApplicationData(source, execution);
      
      case 'configuration':
        return this.scanConfiguration(source, execution);
      
      default:
        throw new Error(`Unsupported source type: ${source.type}`);
    }
  }

  private async scanFilesystem(path: string, filters: BackupFilter[], source: BackupSource): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    
    if (!existsSync(path)) {
      throw new Error(`Source path does not exist: ${path}`);
    }

    const scanDirectory = (dirPath: string): void => {
      try {
        const entries = readdirSync(dirPath);
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry);
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            if (this.shouldInclude(fullPath, filters, true)) {
              scanDirectory(fullPath);
            }
          } else if (stat.isFile()) {
            if (this.shouldInclude(fullPath, filters, false)) {
              files.push({
                path: fullPath,
                relativePath: fullPath.substring(path.length + 1),
                size: stat.size,
                mtime: stat.mtime,
                isDirectory: false,
                permissions: stat.mode,
                checksum: ''
              });
            }
          }
        }
      } catch (error) {
        // Handle permission errors gracefully
        console.warn(`Cannot scan directory ${dirPath}:`, error);
      }
    };

    const stat = statSync(path);
    if (stat.isDirectory()) {
      scanDirectory(path);
    } else {
      files.push({
        path,
        relativePath: path,
        size: stat.size,
        mtime: stat.mtime,
        isDirectory: false,
        permissions: stat.mode,
        checksum: ''
      });
    }

    return files;
  }

  private async scanDatabase(source: BackupSource, execution: BackupExecution): Promise<FileInfo[]> {
    // Database backup implementation would depend on the specific database type
    this.addLog(execution, 'info', `Scanning database: ${source.path}`);
    return [];
  }

  private async scanObjectStorage(source: BackupSource, execution: BackupExecution): Promise<FileInfo[]> {
    // Object storage backup implementation
    this.addLog(execution, 'info', `Scanning object storage: ${source.path}`);
    return [];
  }

  private async scanApplicationData(source: BackupSource, execution: BackupExecution): Promise<FileInfo[]> {
    // Application data backup implementation
    this.addLog(execution, 'info', `Scanning application data: ${source.path}`);
    return [];
  }

  private async scanConfiguration(source: BackupSource, execution: BackupExecution): Promise<FileInfo[]> {
    // Configuration backup implementation
    this.addLog(execution, 'info', `Scanning configuration: ${source.path}`);
    return [];
  }

  private shouldInclude(path: string, filters: BackupFilter[], isDirectory: boolean): boolean {
    let included = true;
    
    for (const filter of filters) {
      if (!filter.enabled) continue;
      
      const matches = this.matchesPattern(path, filter.pattern, filter.patternType, filter.caseSensitive);
      
      if (filter.type === 'include' && matches) {
        included = true;
      } else if (filter.type === 'exclude' && matches) {
        included = false;
      }
    }
    
    return included;
  }

  private matchesPattern(path: string, pattern: string, patternType: string, caseSensitive: boolean): boolean {
    const testPath = caseSensitive ? path : path.toLowerCase();
    const testPattern = caseSensitive ? pattern : pattern.toLowerCase();
    
    switch (patternType) {
      case 'glob':
        // Simple glob implementation
        const globRegex = testPattern
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(`^${globRegex}$`).test(testPath);
      
      case 'regex':
        return new RegExp(testPattern).test(testPath);
      
      case 'path':
        return testPath.includes(testPattern);
      
      default:
        return false;
    }
  }

  private async performFileBackup(
    files: FileInfo[],
    backupPath: string,
    job: BackupJob,
    execution: BackupExecution
  ): Promise<void> {
    let processedFiles = 0;
    let processedBytes = 0;
    const startTime = Date.now();

    for (const file of files) {
      try {
        execution.progress.currentFile = file.relativePath;
        
        const shouldBackup = await this.shouldBackupFile(file, job, execution);
        if (!shouldBackup) {
          execution.statistics.filesSkipped++;
          continue;
        }

        await this.backupFile(file, backupPath, job, execution);
        
        processedFiles++;
        processedBytes += file.size;
        execution.statistics.filesBackedUp++;
        execution.statistics.bytesTransferred += file.size;

        // Update progress
        execution.progress.filesProcessed = processedFiles;
        execution.progress.bytesProcessed = processedBytes;
        execution.progress.overallProgress = Math.min(95, (processedFiles / files.length) * 90);
        
        const elapsed = (Date.now() - startTime) / 1000;
        execution.progress.transferRate = processedBytes / elapsed;
        
        if (processedFiles % 100 === 0) {
          this.emit('backup-progress', execution.progress);
        }

      } catch (error) {
        execution.errors.push({
          timestamp: new Date(),
          code: 'FILE_BACKUP_FAILED',
          message: `Failed to backup file ${file.path}: ${(error as Error).message}`,
          source: file.path,
          recoverable: true
        });
      }
    }
  }

  private async shouldBackupFile(file: FileInfo, job: BackupJob, execution: BackupExecution): Promise<boolean> {
    if (job.type === 'full') {
      return true;
    }

    // For incremental/differential backups, check if file has changed
    const cacheKey = `${job.id}:${file.path}`;
    const cachedChecksum = this.checksumCache.get(cacheKey);
    
    if (!cachedChecksum) {
      return true; // New file
    }

    // Check if file has been modified
    const source = job.sources.find(s => file.path.startsWith(s.path));
    if (!source) {
      return true;
    }

    switch (source.changeDetection) {
      case 'timestamp':
        return source.lastBackup ? file.mtime > source.lastBackup : true;
      
      case 'checksum':
        const currentChecksum = await this.calculateChecksum(file.path);
        return currentChecksum !== cachedChecksum;
      
      case 'both':
        if (source.lastBackup && file.mtime <= source.lastBackup) {
          return false;
        }
        const checksum = await this.calculateChecksum(file.path);
        return checksum !== cachedChecksum;
      
      default:
        return true;
    }
  }

  private async backupFile(
    file: FileInfo,
    backupPath: string,
    job: BackupJob,
    execution: BackupExecution
  ): Promise<void> {
    const targetPath = join(backupPath, file.relativePath);
    const targetDir = dirname(targetPath);
    
    // Ensure target directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Read source file
    let data = await this.readFile(file.path);

    // Apply compression
    if (job.compression.enabled) {
      const compressStart = Date.now();
      data = await this.compressData(data, job.compression);
      execution.statistics.compressionTime += Date.now() - compressStart;
      execution.statistics.bytesCompressed += data.length;
    }

    // Apply encryption
    if (job.encryption.enabled) {
      const encryptStart = Date.now();
      data = await this.encryptData(data, job.encryption);
      execution.statistics.encryptionTime += Date.now() - encryptStart;
    }

    // Write to backup location
    await this.writeFile(targetPath, data);

    // Update checksum cache
    const checksum = await this.calculateChecksum(file.path);
    this.checksumCache.set(`${job.id}:${file.path}`, checksum);
  }

  private async readFile(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath);
      
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  private async writeFile(filePath: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      
      stream.on('finish', resolve);
      stream.on('error', reject);
      
      stream.write(data);
      stream.end();
    });
  }

  private async compressData(data: Buffer, config: CompressionConfig): Promise<Buffer> {
    // Simplified compression - in production use proper compression libraries
    const zlib = require('zlib');
    
    switch (config.algorithm) {
      case 'gzip':
        return zlib.gzipSync(data, { level: config.level });
      case 'bzip2':
        // Would use bzip2 library
        return data;
      default:
        return data;
    }
  }

  private async encryptData(data: Buffer, config: EncryptionConfig): Promise<Buffer> {
    const key = this.getEncryptionKey(config);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(config.algorithm, key);
    const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
    
    return encrypted;
  }

  private getEncryptionKey(config: EncryptionConfig): Buffer {
    switch (config.keySource) {
      case 'password':
        // Derive key from password
        return crypto.pbkdf2Sync('password', 'salt', 100000, 32, 'sha256');
      
      case 'keyfile':
        if (config.keyLocation && existsSync(config.keyLocation)) {
          return require('fs').readFileSync(config.keyLocation);
        }
        break;
      
      case 'kms':
      case 'vault':
        // Would integrate with external key management
        break;
    }
    
    return this.encryptionKeys.get('master') || Buffer.alloc(32);
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private generateBackupPath(job: BackupJob, execution: BackupExecution): string {
    const timestamp = execution.startTime.toISOString().replace(/[:.]/g, '-');
    return join(this.basePath, job.name, `${job.type}-${timestamp}`);
  }

  private async prepareBackupDestination(destination: BackupDestination): Promise<void> {
    switch (destination.type) {
      case 'local':
        if (!existsSync(destination.location)) {
          mkdirSync(destination.location, { recursive: true });
        }
        break;
      
      case 'network':
      case 's3':
      case 'azure':
      case 'gcp':
      case 'ftp':
      case 'sftp':
        // Would implement specific destination preparation
        break;
    }
  }

  private async verifyBackup(backupPath: string, execution: BackupExecution): Promise<void> {
    const verifyStart = Date.now();
    
    // Verify backup integrity by checking file existence and checksums
    this.addLog(execution, 'info', 'Verifying backup integrity');
    
    execution.statistics.verificationTime = Date.now() - verifyStart;
  }

  private async finalizeBackup(execution: BackupExecution, job: BackupJob): Promise<void> {
    // Update execution metadata
    execution.metadata.checksum = await this.calculateBackupChecksum(execution);
    execution.metadata.size = execution.statistics.bytesTransferred;
    execution.metadata.fileCount = execution.statistics.filesBackedUp;

    // Update source last backup timestamps
    for (const source of job.sources) {
      source.lastBackup = execution.endTime || new Date();
    }

    // Create backup manifest
    await this.createBackupManifest(execution, job);
  }

  private async calculateBackupChecksum(execution: BackupExecution): Promise<string> {
    // Calculate overall backup checksum
    return crypto.createHash('sha256')
      .update(execution.id + execution.startTime.toISOString())
      .digest('hex');
  }

  private async createBackupManifest(execution: BackupExecution, job: BackupJob): Promise<void> {
    const manifest = {
      metadata: execution.metadata,
      statistics: execution.statistics,
      job: {
        id: job.id,
        name: job.name,
        type: job.type
      },
      files: [], // Would include file list for full restore
      created: execution.startTime,
      completed: execution.endTime
    };

    const manifestPath = join(this.generateBackupPath(job, execution), 'manifest.json');
    await this.writeFile(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)));
  }

  private async applyRetentionPolicy(job: BackupJob): Promise<void> {
    const retention = job.retention;
    
    switch (retention.type) {
      case 'time-based':
        await this.applyTimeBasedRetention(job);
        break;
      
      case 'count-based':
        await this.applyCountBasedRetention(job);
        break;
      
      case 'size-based':
        await this.applySizeBasedRetention(job);
        break;
      
      case 'hybrid':
        await this.applyTimeBasedRetention(job);
        await this.applyCountBasedRetention(job);
        await this.applySizeBasedRetention(job);
        break;
    }
  }

  private async applyTimeBasedRetention(job: BackupJob): Promise<void> {
    const retention = job.retention.timeRetention;
    if (!retention) return;

    const jobBackupsPath = join(this.basePath, job.name);
    if (!existsSync(jobBackupsPath)) return;

    const backups = readdirSync(jobBackupsPath)
      .map(name => ({
        name,
        path: join(jobBackupsPath, name),
        stat: statSync(join(jobBackupsPath, name))
      }))
      .filter(backup => backup.stat.isDirectory())
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    for (const backup of backups) {
      const age = now - backup.stat.mtime.getTime();
      const days = Math.floor(age / oneDay);
      
      let shouldDelete = false;
      
      if (days > retention.yearly * 365) {
        shouldDelete = true;
      } else if (days > retention.monthly * 30) {
        shouldDelete = true;
      } else if (days > retention.weekly * 7) {
        shouldDelete = true;
      } else if (days > retention.daily) {
        shouldDelete = true;
      }
      
      if (shouldDelete) {
        await this.deleteBackupDirectory(backup.path);
        this.emit('backup-expired', {
          jobId: job.id,
          backupPath: backup.path,
          age: days
        });
      }
    }
  }

  private async applyCountBasedRetention(job: BackupJob): Promise<void> {
    const retention = job.retention.countRetention;
    if (!retention) return;

    const jobBackupsPath = join(this.basePath, job.name);
    if (!existsSync(jobBackupsPath)) return;

    const backups = readdirSync(jobBackupsPath)
      .map(name => ({
        name,
        path: join(jobBackupsPath, name),
        stat: statSync(join(jobBackupsPath, name))
      }))
      .filter(backup => backup.stat.isDirectory())
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

    if (backups.length > retention.maxCount) {
      const backupsToDelete = backups.slice(retention.maxCount);
      
      for (const backup of backupsToDelete) {
        await this.deleteBackupDirectory(backup.path);
        this.emit('backup-expired', {
          jobId: job.id,
          backupPath: backup.path,
          reason: 'count-exceeded'
        });
      }
    }
  }

  private async applySizeBasedRetention(job: BackupJob): Promise<void> {
    const retention = job.retention.sizeRetention;
    if (!retention) return;

    // Implementation would calculate total backup size and remove oldest backups
    // until under the size limit
  }

  private async deleteBackupDirectory(path: string): Promise<void> {
    // Recursively delete backup directory
    const deleteRecursive = (dirPath: string): void => {
      if (existsSync(dirPath)) {
        const files = readdirSync(dirPath);
        
        for (const file of files) {
          const filePath = join(dirPath, file);
          if (statSync(filePath).isDirectory()) {
            deleteRecursive(filePath);
          } else {
            unlinkSync(filePath);
          }
        }
        
        require('fs').rmdirSync(dirPath);
      }
    };

    deleteRecursive(path);
  }

  private deleteJobBackups(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const jobBackupsPath = join(this.basePath, job.name);
    if (existsSync(jobBackupsPath)) {
      this.deleteBackupDirectory(jobBackupsPath);
    }
  }

  private scheduleNextRun(job: BackupJob): void {
    if (!job.schedule.enabled || !job.enabled) {
      return;
    }

    const now = new Date();
    let nextRun: Date;

    switch (job.schedule.type) {
      case 'interval':
        nextRun = new Date(now.getTime() + (job.schedule.interval || 60) * 60 * 1000);
        break;
      
      case 'cron':
        // Would use a proper cron library to calculate next run
        nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to 24 hours
        break;
      
      case 'event-driven':
        // Event-driven schedules don't have fixed next run times
        return;
      
      default:
        return;
    }

    job.nextRun = nextRun;
  }

  private startScheduler(): void {
    this.schedulerInterval = setInterval(async () => {
      await this.checkScheduledJobs();
    }, 60000); // Check every minute
  }

  private async checkScheduledJobs(): Promise<void> {
    const now = new Date();
    
    for (const job of this.jobs.values()) {
      if (!job.enabled || job.status === 'running' || !job.nextRun) {
        continue;
      }

      if (job.nextRun <= now) {
        try {
          await this.executeBackupJob(job.id);
        } catch (error) {
          console.error(`Scheduled backup failed for job ${job.id}:`, error);
        }
      }
    }
  }

  cancelBackupJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') {
      return false;
    }

    // Find active execution
    const execution = Array.from(this.executions.values())
      .find(e => e.jobId === jobId && e.status === 'running');

    if (execution) {
      execution.status = 'cancelled';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      
      this.activeExecutions.delete(execution.id);
    }

    job.status = 'cancelled';
    job.statistics.totalRuns++;
    job.statistics.cancelledRuns++;

    this.emit('backup-cancelled', { jobId, executionId: execution?.id });
    return true;
  }

  private addLog(execution: BackupExecution, level: 'debug' | 'info' | 'warn' | 'error', message: string, component: string = 'backup-manager'): void {
    execution.logs.push({
      timestamp: new Date(),
      level,
      message,
      component
    });

    this.emit('backup-log', {
      executionId: execution.id,
      level,
      message,
      component
    });
  }

  // Public API methods
  getBackupJobs(): BackupJob[] {
    return Array.from(this.jobs.values());
  }

  getBackupJob(jobId: string): BackupJob | null {
    return this.jobs.get(jobId) || null;
  }

  getBackupExecutions(jobId?: string): BackupExecution[] {
    const executions = Array.from(this.executions.values());
    return jobId ? executions.filter(e => e.jobId === jobId) : executions;
  }

  getBackupExecution(executionId: string): BackupExecution | null {
    return this.executions.get(executionId) || null;
  }

  getActiveExecutions(): BackupExecution[] {
    return Array.from(this.activeExecutions)
      .map(id => this.executions.get(id)!)
      .filter(Boolean);
  }

  getStats(): any {
    const jobs = Array.from(this.jobs.values());
    const executions = Array.from(this.executions.values());

    return {
      jobs: {
        total: jobs.length,
        enabled: jobs.filter(j => j.enabled).length,
        running: jobs.filter(j => j.status === 'running').length,
        failed: jobs.filter(j => j.status === 'failed').length
      },
      executions: {
        total: executions.length,
        running: executions.filter(e => e.status === 'running').length,
        completed: executions.filter(e => e.status === 'completed').length,
        failed: executions.filter(e => e.status === 'failed').length,
        cancelled: executions.filter(e => e.status === 'cancelled').length
      },
      storage: {
        totalBackups: executions.filter(e => e.status === 'completed').length,
        totalDataBackedUp: jobs.reduce((sum, j) => sum + j.statistics.totalDataBackedUp, 0),
        averageBackupSize: jobs.reduce((sum, j) => sum + (j.statistics.lastBackupSize || 0), 0) / jobs.length
      }
    };
  }

  destroy(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    // Cancel all running backups
    for (const job of this.jobs.values()) {
      if (job.status === 'running') {
        this.cancelBackupJob(job.id);
      }
    }

    this.jobs.clear();
    this.executions.clear();
    this.restoreJobs.clear();
    this.encryptionKeys.clear();
    this.checksumCache.clear();
    this.changeDetectionCache.clear();

    this.removeAllListeners();
  }
}

interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  mtime: Date;
  isDirectory: boolean;
  permissions: number;
  checksum: string;
}