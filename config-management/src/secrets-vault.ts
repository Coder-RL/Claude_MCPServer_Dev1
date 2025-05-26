import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface Secret {
  id: string;
  key: string;
  value: string;
  metadata: SecretMetadata;
  versions: SecretVersion[];
  currentVersion: number;
}

export interface SecretMetadata {
  description?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  expiresAt?: Date;
  rotationPolicy?: RotationPolicy;
  accessPolicy?: AccessPolicy;
}

export interface SecretVersion {
  version: number;
  value: string;
  createdAt: Date;
  createdBy: string;
  isActive: boolean;
}

export interface RotationPolicy {
  enabled: boolean;
  interval: number; // days
  autoRotate?: boolean;
  notifyBefore?: number; // days
  maxVersions?: number;
}

export interface AccessPolicy {
  allowedUsers: string[];
  allowedRoles: string[];
  allowedServices: string[];
  ipWhitelist?: string[];
  timeRestrictions?: TimeRestriction[];
  requiredScopes?: string[];
}

export interface TimeRestriction {
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  days: number[]; // 0-6, Sunday to Saturday
  timezone?: string;
}

export interface VaultConfig {
  storageType: 'file' | 'memory' | 'database' | 'remote';
  storagePath?: string;
  encryptionAlgorithm: string;
  keyDerivation: {
    algorithm: string;
    iterations: number;
    saltLength: number;
  };
  backup?: {
    enabled: boolean;
    interval: number; // hours
    retentionDays: number;
    location: string;
  };
  audit?: {
    enabled: boolean;
    logPath: string;
    logRotation: boolean;
  };
}

export interface AuditEntry {
  timestamp: Date;
  action: string;
  secretId?: string;
  user: string;
  clientIP?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SecretRequest {
  secretId: string;
  user: string;
  clientIP?: string;
  userAgent?: string;
  requiredScopes?: string[];
}

export class SecretsVault extends EventEmitter {
  private secrets = new Map<string, Secret>();
  private masterKey: Buffer | null = null;
  private config: VaultConfig;
  private auditLog: AuditEntry[] = [];
  private rotationTimers = new Map<string, NodeJS.Timeout>();
  private backupTimer: NodeJS.Timeout | null = null;
  private isUnlocked = false;
  private accessCache = new Map<string, { user: string; expires: number }>();

  constructor(config: VaultConfig) {
    super();
    this.config = config;
    this.initializeStorage();
  }

  private initializeStorage(): void {
    if (this.config.storageType === 'file') {
      const storagePath = this.config.storagePath || join(process.cwd(), '.vault');
      if (!existsSync(storagePath)) {
        mkdirSync(storagePath, { recursive: true });
      }
    }

    if (this.config.backup?.enabled) {
      this.setupBackupSchedule();
    }
  }

  async initialize(masterPassword: string): Promise<void> {
    try {
      // Derive master key from password
      this.masterKey = await this.deriveKey(masterPassword);
      
      // Load existing secrets
      await this.loadSecrets();
      
      // Setup rotation schedules
      this.setupRotationSchedules();
      
      this.isUnlocked = true;
      this.emit('initialized');
      
      this.auditLog.push({
        timestamp: new Date(),
        action: 'vault_unlocked',
        user: 'system',
        success: true
      });
      
    } catch (error) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'vault_unlock_failed',
        user: 'system',
        success: false,
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async deriveKey(password: string): Promise<Buffer> {
    const salt = this.getSalt();
    
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        this.config.keyDerivation.iterations,
        32, // 256 bits
        'sha256',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  private getSalt(): Buffer {
    const saltPath = join(this.config.storagePath || '.vault', 'salt');
    
    if (existsSync(saltPath)) {
      return readFileSync(saltPath);
    } else {
      const salt = crypto.randomBytes(this.config.keyDerivation.saltLength);
      writeFileSync(saltPath, salt, { mode: 0o600 });
      return salt;
    }
  }

  async createSecret(
    key: string,
    value: string,
    metadata: Partial<SecretMetadata>,
    createdBy: string
  ): Promise<string> {
    this.ensureUnlocked();
    
    const secretId = crypto.randomUUID();
    const now = new Date();
    
    const secret: Secret = {
      id: secretId,
      key,
      value: await this.encrypt(value),
      metadata: {
        description: metadata.description,
        tags: metadata.tags || [],
        createdAt: now,
        updatedAt: now,
        createdBy,
        updatedBy: createdBy,
        expiresAt: metadata.expiresAt,
        rotationPolicy: metadata.rotationPolicy,
        accessPolicy: metadata.accessPolicy
      },
      versions: [{
        version: 1,
        value: await this.encrypt(value),
        createdAt: now,
        createdBy,
        isActive: true
      }],
      currentVersion: 1
    };

    this.secrets.set(secretId, secret);
    await this.persistSecrets();
    
    // Setup rotation if enabled
    if (secret.metadata.rotationPolicy?.enabled) {
      this.setupRotationTimer(secretId);
    }
    
    this.auditLog.push({
      timestamp: now,
      action: 'secret_created',
      secretId,
      user: createdBy,
      success: true,
      metadata: { key }
    });
    
    this.emit('secret-created', { secretId, key });
    return secretId;
  }

  async getSecret(request: SecretRequest): Promise<string> {
    this.ensureUnlocked();
    
    const secret = this.findSecretByKey(request.secretId) || this.secrets.get(request.secretId);
    if (!secret) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'secret_access_failed',
        secretId: request.secretId,
        user: request.user,
        clientIP: request.clientIP,
        success: false,
        error: 'Secret not found'
      });
      throw new Error(`Secret not found: ${request.secretId}`);
    }

    // Check access permissions
    if (!await this.checkAccess(secret, request)) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'secret_access_denied',
        secretId: secret.id,
        user: request.user,
        clientIP: request.clientIP,
        success: false,
        error: 'Access denied'
      });
      throw new Error('Access denied');
    }

    // Check expiration
    if (secret.metadata.expiresAt && secret.metadata.expiresAt < new Date()) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'secret_access_failed',
        secretId: secret.id,
        user: request.user,
        clientIP: request.clientIP,
        success: false,
        error: 'Secret expired'
      });
      throw new Error('Secret has expired');
    }

    const decryptedValue = await this.decrypt(secret.value);
    
    this.auditLog.push({
      timestamp: new Date(),
      action: 'secret_accessed',
      secretId: secret.id,
      user: request.user,
      clientIP: request.clientIP,
      success: true,
      metadata: { key: secret.key }
    });
    
    this.emit('secret-accessed', { secretId: secret.id, user: request.user });
    return decryptedValue;
  }

  async updateSecret(
    secretId: string,
    newValue: string,
    updatedBy: string,
    createVersion: boolean = true
  ): Promise<void> {
    this.ensureUnlocked();
    
    const secret = this.secrets.get(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    const now = new Date();
    const encryptedValue = await this.encrypt(newValue);
    
    if (createVersion) {
      // Create new version
      const newVersion = secret.versions.length + 1;
      
      // Deactivate current version
      secret.versions.forEach(v => v.isActive = false);
      
      // Add new version
      secret.versions.push({
        version: newVersion,
        value: encryptedValue,
        createdAt: now,
        createdBy: updatedBy,
        isActive: true
      });
      
      secret.currentVersion = newVersion;
      
      // Cleanup old versions if rotation policy specifies max versions
      const maxVersions = secret.metadata.rotationPolicy?.maxVersions;
      if (maxVersions && secret.versions.length > maxVersions) {
        secret.versions = secret.versions.slice(-maxVersions);
      }
    }
    
    secret.value = encryptedValue;
    secret.metadata.updatedAt = now;
    secret.metadata.updatedBy = updatedBy;
    
    await this.persistSecrets();
    
    this.auditLog.push({
      timestamp: now,
      action: 'secret_updated',
      secretId,
      user: updatedBy,
      success: true,
      metadata: { 
        key: secret.key,
        createVersion,
        version: secret.currentVersion
      }
    });
    
    this.emit('secret-updated', { secretId, version: secret.currentVersion });
  }

  async rotateSecret(secretId: string, rotatedBy: string): Promise<void> {
    const secret = this.secrets.get(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    // Generate new secret value (implementation depends on secret type)
    const newValue = await this.generateSecretValue(secret);
    await this.updateSecret(secretId, newValue, rotatedBy, true);
    
    // Reset rotation timer
    this.setupRotationTimer(secretId);
    
    this.emit('secret-rotated', { secretId, rotatedBy });
  }

  async deleteSecret(secretId: string, deletedBy: string): Promise<void> {
    this.ensureUnlocked();
    
    const secret = this.secrets.get(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    // Clear rotation timer
    const timer = this.rotationTimers.get(secretId);
    if (timer) {
      clearTimeout(timer);
      this.rotationTimers.delete(secretId);
    }

    this.secrets.delete(secretId);
    await this.persistSecrets();
    
    this.auditLog.push({
      timestamp: new Date(),
      action: 'secret_deleted',
      secretId,
      user: deletedBy,
      success: true,
      metadata: { key: secret.key }
    });
    
    this.emit('secret-deleted', { secretId, key: secret.key });
  }

  private findSecretByKey(key: string): Secret | undefined {
    for (const secret of this.secrets.values()) {
      if (secret.key === key) {
        return secret;
      }
    }
    return undefined;
  }

  private async checkAccess(secret: Secret, request: SecretRequest): Promise<boolean> {
    const policy = secret.metadata.accessPolicy;
    if (!policy) {
      return true; // No policy means open access
    }

    // Check user access
    if (policy.allowedUsers.length > 0 && !policy.allowedUsers.includes(request.user)) {
      return false;
    }

    // Check IP whitelist
    if (policy.ipWhitelist && request.clientIP) {
      if (!policy.ipWhitelist.includes(request.clientIP)) {
        return false;
      }
    }

    // Check time restrictions
    if (policy.timeRestrictions) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentDay = now.getDay();
      
      const isAllowed = policy.timeRestrictions.some(restriction => {
        const inTimeWindow = currentTime >= restriction.startTime && currentTime <= restriction.endTime;
        const inAllowedDays = restriction.days.includes(currentDay);
        return inTimeWindow && inAllowedDays;
      });
      
      if (!isAllowed) {
        return false;
      }
    }

    // Check required scopes
    if (policy.requiredScopes && request.requiredScopes) {
      const hasRequiredScopes = policy.requiredScopes.every(scope =>
        request.requiredScopes!.includes(scope)
      );
      if (!hasRequiredScopes) {
        return false;
      }
    }

    return true;
  }

  private async encrypt(value: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Vault is locked');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.config.encryptionAlgorithm, this.masterKey);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decrypt(encryptedValue: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Vault is locked');
    }

    const [ivHex, encrypted] = encryptedValue.split(':');
    const decipher = crypto.createDecipher(this.config.encryptionAlgorithm, this.masterKey);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private async loadSecrets(): Promise<void> {
    if (this.config.storageType === 'file') {
      const filePath = join(this.config.storagePath || '.vault', 'secrets.enc');
      
      if (existsSync(filePath)) {
        try {
          const encryptedData = readFileSync(filePath, 'utf8');
          const decryptedData = await this.decrypt(encryptedData);
          const secretsData = JSON.parse(decryptedData);
          
          // Restore Date objects
          for (const secretData of secretsData) {
            secretData.metadata.createdAt = new Date(secretData.metadata.createdAt);
            secretData.metadata.updatedAt = new Date(secretData.metadata.updatedAt);
            if (secretData.metadata.expiresAt) {
              secretData.metadata.expiresAt = new Date(secretData.metadata.expiresAt);
            }
            
            secretData.versions.forEach((version: any) => {
              version.createdAt = new Date(version.createdAt);
            });
            
            this.secrets.set(secretData.id, secretData);
          }
          
        } catch (error) {
          throw new Error(`Failed to load secrets: ${error}`);
        }
      }
    }
  }

  private async persistSecrets(): Promise<void> {
    if (this.config.storageType === 'file') {
      const filePath = join(this.config.storagePath || '.vault', 'secrets.enc');
      const secretsArray = Array.from(this.secrets.values());
      const jsonData = JSON.stringify(secretsArray, null, 2);
      const encryptedData = await this.encrypt(jsonData);
      
      writeFileSync(filePath, encryptedData, { mode: 0o600 });
    }
  }

  private setupRotationSchedules(): void {
    for (const secret of this.secrets.values()) {
      if (secret.metadata.rotationPolicy?.enabled) {
        this.setupRotationTimer(secret.id);
      }
    }
  }

  private setupRotationTimer(secretId: string): void {
    const secret = this.secrets.get(secretId);
    if (!secret?.metadata.rotationPolicy?.enabled) {
      return;
    }

    // Clear existing timer
    const existingTimer = this.rotationTimers.get(secretId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const rotationInterval = secret.metadata.rotationPolicy.interval * 24 * 60 * 60 * 1000; // Convert days to ms
    
    const timer = setTimeout(async () => {
      if (secret.metadata.rotationPolicy?.autoRotate) {
        try {
          await this.rotateSecret(secretId, 'system');
        } catch (error) {
          this.emit('rotation-failed', { secretId, error: (error as Error).message });
        }
      } else {
        this.emit('rotation-due', { secretId, secret: secret.key });
      }
    }, rotationInterval);

    this.rotationTimers.set(secretId, timer);
  }

  private async generateSecretValue(secret: Secret): Promise<string> {
    // This is a simplified implementation
    // In production, this would generate appropriate values based on secret type
    return crypto.randomBytes(32).toString('hex');
  }

  private setupBackupSchedule(): void {
    if (!this.config.backup?.enabled) {
      return;
    }

    const interval = this.config.backup.interval * 60 * 60 * 1000; // Convert hours to ms
    
    this.backupTimer = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        this.emit('backup-failed', { error: (error as Error).message });
      }
    }, interval);
  }

  private async createBackup(): Promise<void> {
    if (!this.config.backup?.enabled) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(this.config.backup.location, `vault-backup-${timestamp}.enc`);
    
    const secretsArray = Array.from(this.secrets.values());
    const backupData = {
      timestamp: new Date(),
      secrets: secretsArray,
      audit: this.auditLog.slice(-1000) // Keep last 1000 audit entries
    };
    
    const jsonData = JSON.stringify(backupData, null, 2);
    const encryptedData = await this.encrypt(jsonData);
    
    if (!existsSync(dirname(backupPath))) {
      mkdirSync(dirname(backupPath), { recursive: true });
    }
    
    writeFileSync(backupPath, encryptedData, { mode: 0o600 });
    this.emit('backup-created', { path: backupPath });
  }

  private ensureUnlocked(): void {
    if (!this.isUnlocked || !this.masterKey) {
      throw new Error('Vault is locked');
    }
  }

  lock(): void {
    this.masterKey = null;
    this.isUnlocked = false;
    this.secrets.clear();
    this.accessCache.clear();
    
    // Clear rotation timers
    for (const timer of this.rotationTimers.values()) {
      clearTimeout(timer);
    }
    this.rotationTimers.clear();
    
    this.auditLog.push({
      timestamp: new Date(),
      action: 'vault_locked',
      user: 'system',
      success: true
    });
    
    this.emit('locked');
  }

  getAuditLog(limit: number = 100): AuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  listSecrets(user: string): Array<{ id: string; key: string; metadata: Partial<SecretMetadata> }> {
    this.ensureUnlocked();
    
    const result = [];
    for (const secret of this.secrets.values()) {
      // Check if user has access (simplified check)
      const policy = secret.metadata.accessPolicy;
      if (!policy || policy.allowedUsers.length === 0 || policy.allowedUsers.includes(user)) {
        result.push({
          id: secret.id,
          key: secret.key,
          metadata: {
            description: secret.metadata.description,
            tags: secret.metadata.tags,
            createdAt: secret.metadata.createdAt,
            updatedAt: secret.metadata.updatedAt,
            expiresAt: secret.metadata.expiresAt
          }
        });
      }
    }
    
    return result;
  }

  getStats(): any {
    return {
      secretCount: this.secrets.size,
      isUnlocked: this.isUnlocked,
      rotationTimers: this.rotationTimers.size,
      auditEntries: this.auditLog.length,
      cacheSize: this.accessCache.size,
      config: {
        storageType: this.config.storageType,
        backupEnabled: this.config.backup?.enabled,
        auditEnabled: this.config.audit?.enabled
      }
    };
  }

  destroy(): void {
    this.lock();
    
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }
    
    this.removeAllListeners();
  }
}