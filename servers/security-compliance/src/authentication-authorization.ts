import { BaseServer } from '../../shared/src/base-server';
import { MCPError } from '../../shared/src/errors';
import { withPerformanceMonitoring } from '../../shared/src/monitoring';
import { withRetry } from '../../shared/src/retry';
import { HealthChecker } from '../../shared/src/health';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: 'active' | 'inactive' | 'locked' | 'pending';
  roles: string[];
  groups: string[];
  attributes: Record<string, any>;
  metadata: {
    lastLogin?: Date;
    loginAttempts: number;
    lockoutUntil?: Date;
    passwordLastChanged?: Date;
    mfaEnabled: boolean;
    mfaSecrets?: string[];
  };
  created: Date;
  updated: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  inherits: string[];
  type: 'built-in' | 'custom';
  scope: 'global' | 'resource' | 'tenant';
  metadata: Record<string, any>;
  created: Date;
  updated: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: PolicyCondition[];
  effect: 'allow' | 'deny';
  priority: number;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  type: 'organizational' | 'functional' | 'security';
  parent?: string;
  members: string[];
  roles: string[];
  attributes: Record<string, any>;
  created: Date;
  updated: Date;
}

export interface AuthenticationProvider {
  id: string;
  name: string;
  type: 'local' | 'ldap' | 'oauth2' | 'saml' | 'oidc' | 'active-directory';
  enabled: boolean;
  priority: number;
  configuration: ProviderConfiguration;
  userMapping: UserMappingConfig;
  groupMapping?: GroupMappingConfig;
  created: Date;
  updated: Date;
}

export interface ProviderConfiguration {
  endpoint?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string[];
  redirectUri?: string;
  issuer?: string;
  certificate?: string;
  ldapConfig?: LDAPConfiguration;
  customConfig?: Record<string, any>;
}

export interface LDAPConfiguration {
  host: string;
  port: number;
  baseDN: string;
  bindDN: string;
  bindPassword: string;
  userSearchBase: string;
  userSearchFilter: string;
  groupSearchBase: string;
  groupSearchFilter: string;
  tlsEnabled: boolean;
}

export interface UserMappingConfig {
  usernameAttribute: string;
  emailAttribute: string;
  displayNameAttribute: string;
  roleAttribute?: string;
  groupAttribute?: string;
  customAttributes: Record<string, string>;
}

export interface GroupMappingConfig {
  nameAttribute: string;
  descriptionAttribute: string;
  memberAttribute: string;
  customAttributes: Record<string, string>;
}

export interface AuthenticationSession {
  id: string;
  userId: string;
  providerId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string[];
  attributes: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  created: Date;
  lastActivity: Date;
  revoked: boolean;
}

export interface AuthorizationPolicy {
  id: string;
  name: string;
  description: string;
  type: 'role-based' | 'attribute-based' | 'rule-based' | 'time-based';
  rules: PolicyRule[];
  effect: 'allow' | 'deny';
  priority: number;
  enabled: boolean;
  conditions: PolicyCondition[];
  created: Date;
  updated: Date;
}

export interface PolicyRule {
  id: string;
  subject: string;
  resource: string;
  action: string;
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny';
}

export interface PolicyCondition {
  attribute: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'in' | 'not-in' | 'contains' | 'regex';
  value: any;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
}

export interface AccessToken {
  id: string;
  userId: string;
  type: 'access' | 'refresh' | 'api-key';
  token: string;
  scope: string[];
  expiresAt?: Date;
  revoked: boolean;
  metadata: Record<string, any>;
  created: Date;
  lastUsed?: Date;
}

export interface MFADevice {
  id: string;
  userId: string;
  type: 'totp' | 'sms' | 'email' | 'hardware' | 'backup-codes';
  name: string;
  enabled: boolean;
  verified: boolean;
  secret?: string;
  backupCodes?: string[];
  phoneNumber?: string;
  emailAddress?: string;
  serialNumber?: string;
  metadata: Record<string, any>;
  lastUsed?: Date;
  created: Date;
}

export interface AuthenticationEvent {
  id: string;
  type: 'login' | 'logout' | 'failed-login' | 'account-locked' | 'password-changed' | 'mfa-enabled' | 'token-issued' | 'token-revoked';
  userId?: string;
  sessionId?: string;
  providerId?: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
  details: any;
  timestamp: Date;
  riskScore?: number;
}

export interface SecurityConfig {
  passwordPolicy: PasswordPolicy;
  sessionConfig: SessionConfiguration;
  mfaConfig: MFAConfiguration;
  tokenConfig: TokenConfiguration;
  riskAssessment: RiskAssessmentConfig;
  auditConfig: AuditConfiguration;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  preventReuseCount: number;
  maxAge: number;
  lockoutThreshold: number;
  lockoutDuration: number;
}

export interface SessionConfiguration {
  maxDuration: number;
  idleTimeout: number;
  maxConcurrentSessions: number;
  requireMFA: boolean;
  bindToIP: boolean;
  secureTransport: boolean;
}

export interface MFAConfiguration {
  required: boolean;
  allowedMethods: string[];
  gracePeriod: number;
  backupCodesCount: number;
  totpWindowSize: number;
}

export interface TokenConfiguration {
  accessTokenTTL: number;
  refreshTokenTTL: number;
  issuer: string;
  audience: string;
  algorithm: string;
  secretRotationInterval: number;
}

export interface RiskAssessmentConfig {
  enabled: boolean;
  factors: RiskFactor[];
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
  actions: RiskAction[];
}

export interface RiskFactor {
  type: 'location' | 'device' | 'behavior' | 'time' | 'velocity';
  weight: number;
  enabled: boolean;
  config: Record<string, any>;
}

export interface RiskAction {
  threshold: 'low' | 'medium' | 'high';
  action: 'allow' | 'challenge' | 'block' | 'notify';
  config: Record<string, any>;
}

export interface AuditConfiguration {
  enabled: boolean;
  events: string[];
  retention: number;
  encryption: boolean;
  compression: boolean;
  destinations: AuditDestination[];
}

export interface AuditDestination {
  type: 'file' | 'database' | 'syslog' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

export class AuthenticationAuthorizationService {
  private config: SecurityConfig;
  private users: Map<string, User> = new Map();
  private roles: Map<string, Role> = new Map();
  private groups: Map<string, Group> = new Map();
  private providers: Map<string, AuthenticationProvider> = new Map();
  private sessions: Map<string, AuthenticationSession> = new Map();
  private policies: Map<string, AuthorizationPolicy> = new Map();
  private tokens: Map<string, AccessToken> = new Map();
  private mfaDevices: Map<string, MFADevice[]> = new Map();
  private authEvents: AuthenticationEvent[] = [];
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(config: SecurityConfig, configPath: string = './data/security') {
    this.config = config;
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
    this.initializeBuiltinRoles();
  }

  private initializeBuiltinRoles(): void {
    const adminRole: Role = {
      id: 'role_admin',
      name: 'Administrator',
      description: 'Full system administrator access',
      permissions: [
        { id: 'perm_admin_all', resource: '*', action: '*', effect: 'allow', priority: 1000 }
      ],
      inherits: [],
      type: 'built-in',
      scope: 'global',
      metadata: {},
      created: new Date(),
      updated: new Date()
    };

    const userRole: Role = {
      id: 'role_user',
      name: 'User',
      description: 'Basic user access',
      permissions: [
        { id: 'perm_user_read', resource: 'user:self', action: 'read', effect: 'allow', priority: 100 },
        { id: 'perm_user_update', resource: 'user:self', action: 'update', effect: 'allow', priority: 100 }
      ],
      inherits: [],
      type: 'built-in',
      scope: 'global',
      metadata: {},
      created: new Date(),
      updated: new Date()
    };

    this.roles.set(adminRole.id, adminRole);
    this.roles.set(userRole.id, userRole);
  }

  @withPerformanceMonitoring('auth.create-user')
  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const existingUser = Array.from(this.users.values())
        .find(u => u.username === userData.username || u.email === userData.email);
      
      if (existingUser) {
        throw new MCPError('AUTH_ERROR', 'User with this username or email already exists');
      }

      const user: User = {
        ...userData,
        id,
        status: userData.status || 'active',
        roles: userData.roles || ['role_user'],
        groups: userData.groups || [],
        attributes: userData.attributes || {},
        metadata: {
          loginAttempts: 0,
          mfaEnabled: false,
          ...userData.metadata
        },
        created: new Date(),
        updated: new Date()
      };

      this.users.set(id, user);
      await this.saveUsers();

      await this.logAuthEvent({
        type: 'user-created',
        userId: id,
        success: true,
        ipAddress: '127.0.0.1',
        userAgent: 'system',
        details: { username: user.username, email: user.email }
      });

      return id;
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Failed to create user: ${error}`);
    }
  }

  @withPerformanceMonitoring('auth.authenticate')
  async authenticate(credentials: {
    username?: string;
    email?: string;
    password?: string;
    token?: string;
    mfaCode?: string;
    providerId?: string;
  }, context: {
    ipAddress: string;
    userAgent: string;
  }): Promise<AuthenticationResult> {
    try {
      let user: User | undefined;
      let provider: AuthenticationProvider | undefined;

      if (credentials.token) {
        return await this.authenticateWithToken(credentials.token, context);
      }

      if (credentials.providerId) {
        provider = this.providers.get(credentials.providerId);
        if (!provider || !provider.enabled) {
          throw new MCPError('AUTH_ERROR', 'Invalid authentication provider');
        }
        return await this.authenticateWithProvider(provider, credentials, context);
      }

      user = this.findUserByIdentifier(credentials.username || credentials.email || '');
      if (!user) {
        await this.logAuthEvent({
          type: 'failed-login',
          success: false,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: { reason: 'user-not-found', identifier: credentials.username || credentials.email }
        });
        throw new MCPError('AUTH_ERROR', 'Invalid credentials');
      }

      if (user.status !== 'active') {
        await this.logAuthEvent({
          type: 'failed-login',
          userId: user.id,
          success: false,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: { reason: 'user-inactive', status: user.status }
        });
        throw new MCPError('AUTH_ERROR', 'Account is not active');
      }

      if (user.metadata.lockoutUntil && user.metadata.lockoutUntil > new Date()) {
        await this.logAuthEvent({
          type: 'failed-login',
          userId: user.id,
          success: false,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: { reason: 'account-locked' }
        });
        throw new MCPError('AUTH_ERROR', 'Account is locked');
      }

      const passwordValid = await this.validatePassword(user, credentials.password || '');
      if (!passwordValid) {
        user.metadata.loginAttempts++;
        
        if (user.metadata.loginAttempts >= this.config.passwordPolicy.lockoutThreshold) {
          user.metadata.lockoutUntil = new Date(Date.now() + this.config.passwordPolicy.lockoutDuration);
          await this.logAuthEvent({
            type: 'account-locked',
            userId: user.id,
            success: false,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            details: { reason: 'too-many-attempts' }
          });
        }

        await this.saveUsers();
        throw new MCPError('AUTH_ERROR', 'Invalid credentials');
      }

      if (user.metadata.mfaEnabled && !credentials.mfaCode) {
        return {
          success: false,
          requiresMFA: true,
          userId: user.id,
          message: 'Multi-factor authentication required'
        };
      }

      if (user.metadata.mfaEnabled && credentials.mfaCode) {
        const mfaValid = await this.validateMFA(user.id, credentials.mfaCode);
        if (!mfaValid) {
          await this.logAuthEvent({
            type: 'failed-login',
            userId: user.id,
            success: false,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            details: { reason: 'invalid-mfa' }
          });
          throw new MCPError('AUTH_ERROR', 'Invalid MFA code');
        }
      }

      const riskScore = await this.assessAuthenticationRisk(user, context);
      if (riskScore >= this.config.riskAssessment.thresholds.high) {
        await this.logAuthEvent({
          type: 'failed-login',
          userId: user.id,
          success: false,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: { reason: 'high-risk', riskScore }
        });
        throw new MCPError('AUTH_ERROR', 'Authentication blocked due to risk assessment');
      }

      user.metadata.loginAttempts = 0;
      user.metadata.lastLogin = new Date();
      user.metadata.lockoutUntil = undefined;
      user.updated = new Date();

      const session = await this.createSession(user, context, 'local');
      await this.saveUsers();

      await this.logAuthEvent({
        type: 'login',
        userId: user.id,
        sessionId: session.id,
        success: true,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: { provider: 'local', riskScore }
      });

      return {
        success: true,
        user,
        session,
        riskScore
      };
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError('AUTH_ERROR', `Authentication failed: ${error}`);
    }
  }

  @withPerformanceMonitoring('auth.authorize')
  async authorize(sessionId: string, resource: string, action: string, context?: Record<string, any>): Promise<AuthorizationResult> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || session.revoked || session.expiresAt < new Date()) {
        return {
          allowed: false,
          reason: 'Invalid or expired session',
          policies: []
        };
      }

      const user = this.users.get(session.userId);
      if (!user || user.status !== 'active') {
        return {
          allowed: false,
          reason: 'User not found or inactive',
          policies: []
        };
      }

      session.lastActivity = new Date();
      const authContext = {
        user,
        session,
        resource,
        action,
        ...context
      };

      const evaluationResult = await this.evaluateAuthorization(authContext);
      
      await this.logAuthEvent({
        type: 'authorization',
        userId: user.id,
        sessionId: session.id,
        success: evaluationResult.allowed,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        details: {
          resource,
          action,
          policies: evaluationResult.policies.map(p => p.id),
          reason: evaluationResult.reason
        }
      });

      return evaluationResult;
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Authorization failed: ${error}`);
    }
  }

  @withPerformanceMonitoring('auth.create-role')
  async createRole(roleData: Omit<Role, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const existingRole = Array.from(this.roles.values())
        .find(r => r.name === roleData.name);
      
      if (existingRole) {
        throw new MCPError('AUTH_ERROR', 'Role with this name already exists');
      }

      const role: Role = {
        ...roleData,
        id,
        type: 'custom',
        created: new Date(),
        updated: new Date()
      };

      this.roles.set(id, role);
      await this.saveRoles();

      return id;
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Failed to create role: ${error}`);
    }
  }

  @withPerformanceMonitoring('auth.create-policy')
  async createAuthorizationPolicy(policyData: Omit<AuthorizationPolicy, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const policy: AuthorizationPolicy = {
        ...policyData,
        id,
        created: new Date(),
        updated: new Date()
      };

      this.policies.set(id, policy);
      await this.savePolicies();

      return id;
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Failed to create authorization policy: ${error}`);
    }
  }

  @withPerformanceMonitoring('auth.enable-mfa')
  async enableMFA(userId: string, deviceType: 'totp' | 'sms' | 'email', config: Record<string, any>): Promise<MFASetupResult> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new MCPError('AUTH_ERROR', 'User not found');
      }

      const deviceId = `mfa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let secret: string | undefined;
      let backupCodes: string[] | undefined;

      if (deviceType === 'totp') {
        secret = crypto.randomBytes(32).toString('base32');
      }

      if (this.config.mfaConfig.backupCodesCount > 0) {
        backupCodes = this.generateBackupCodes(this.config.mfaConfig.backupCodesCount);
      }

      const device: MFADevice = {
        id: deviceId,
        userId,
        type: deviceType,
        name: config.name || `${deviceType} Device`,
        enabled: true,
        verified: false,
        secret,
        backupCodes,
        phoneNumber: config.phoneNumber,
        emailAddress: config.emailAddress,
        metadata: config.metadata || {},
        created: new Date()
      };

      const userDevices = this.mfaDevices.get(userId) || [];
      userDevices.push(device);
      this.mfaDevices.set(userId, userDevices);

      await this.saveMFADevices();

      return {
        deviceId,
        secret,
        backupCodes,
        qrCode: deviceType === 'totp' ? this.generateQRCode(user, secret!) : undefined
      };
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Failed to enable MFA: ${error}`);
    }
  }

  @withRetry({ maxAttempts: 3, delayMs: 1000 })
  @withPerformanceMonitoring('auth.revoke-session')
  async revokeSession(sessionId: string, reason?: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new MCPError('AUTH_ERROR', 'Session not found');
      }

      session.revoked = true;
      await this.saveSessions();

      await this.logAuthEvent({
        type: 'logout',
        userId: session.userId,
        sessionId: session.id,
        success: true,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        details: { reason: reason || 'manual-revocation' }
      });
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Failed to revoke session: ${error}`);
    }
  }

  @withPerformanceMonitoring('auth.get-user-permissions')
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new MCPError('AUTH_ERROR', 'User not found');
      }

      const permissions: Permission[] = [];
      const processedRoles = new Set<string>();

      const collectRolePermissions = (roleId: string) => {
        if (processedRoles.has(roleId)) return;
        processedRoles.add(roleId);

        const role = this.roles.get(roleId);
        if (!role) return;

        permissions.push(...role.permissions);

        for (const inheritedRoleId of role.inherits) {
          collectRolePermissions(inheritedRoleId);
        }
      };

      for (const roleId of user.roles) {
        collectRolePermissions(roleId);
      }

      for (const groupId of user.groups) {
        const group = this.groups.get(groupId);
        if (group) {
          for (const groupRoleId of group.roles) {
            collectRolePermissions(groupRoleId);
          }
        }
      }

      return permissions;
    } catch (error) {
      throw new MCPError('AUTH_ERROR', `Failed to get user permissions: ${error}`);
    }
  }

  private findUserByIdentifier(identifier: string): User | undefined {
    return Array.from(this.users.values())
      .find(user => user.username === identifier || user.email === identifier);
  }

  private async validatePassword(user: User, password: string): Promise<boolean> {
    const hashedPassword = crypto.createHash('sha256').update(password + user.id).digest('hex');
    return hashedPassword === user.attributes.passwordHash;
  }

  private async validateMFA(userId: string, code: string): Promise<boolean> {
    const devices = this.mfaDevices.get(userId) || [];
    
    for (const device of devices.filter(d => d.enabled && d.verified)) {
      if (device.type === 'totp' && device.secret) {
        if (this.validateTOTP(device.secret, code)) {
          device.lastUsed = new Date();
          await this.saveMFADevices();
          return true;
        }
      }
      
      if (device.backupCodes && device.backupCodes.includes(code)) {
        device.backupCodes = device.backupCodes.filter(c => c !== code);
        device.lastUsed = new Date();
        await this.saveMFADevices();
        return true;
      }
    }

    return false;
  }

  private validateTOTP(secret: string, code: string): boolean {
    const window = this.config.mfaConfig.totpWindowSize;
    const timeStep = 30;
    const currentTime = Math.floor(Date.now() / 1000 / timeStep);

    for (let i = -window; i <= window; i++) {
      const timeSlot = currentTime + i;
      const expectedCode = this.generateTOTP(secret, timeSlot);
      if (expectedCode === code) {
        return true;
      }
    }

    return false;
  }

  private generateTOTP(secret: string, timeSlot: number): string {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(0, 0);
    buffer.writeUInt32BE(timeSlot, 4);
    
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base32'));
    hmac.update(buffer);
    const digest = hmac.digest();
    
    const offset = digest[digest.length - 1] & 0x0f;
    const code = ((digest[offset] & 0x7f) << 24) |
                 ((digest[offset + 1] & 0xff) << 16) |
                 ((digest[offset + 2] & 0xff) << 8) |
                 (digest[offset + 3] & 0xff);
    
    return (code % Math.pow(10, 6)).toString().padStart(6, '0');
  }

  private async assessAuthenticationRisk(user: User, context: { ipAddress: string; userAgent: string }): Promise<number> {
    let riskScore = 0;

    if (!this.config.riskAssessment.enabled) {
      return riskScore;
    }

    for (const factor of this.config.riskAssessment.factors.filter(f => f.enabled)) {
      switch (factor.type) {
        case 'location':
          riskScore += await this.assessLocationRisk(user, context.ipAddress) * factor.weight;
          break;
        case 'device':
          riskScore += await this.assessDeviceRisk(user, context.userAgent) * factor.weight;
          break;
        case 'behavior':
          riskScore += await this.assessBehaviorRisk(user, context) * factor.weight;
          break;
        case 'time':
          riskScore += await this.assessTimeRisk(user) * factor.weight;
          break;
        case 'velocity':
          riskScore += await this.assessVelocityRisk(user, context) * factor.weight;
          break;
      }
    }

    return Math.min(riskScore, 100);
  }

  private async assessLocationRisk(user: User, ipAddress: string): Promise<number> {
    return 0;
  }

  private async assessDeviceRisk(user: User, userAgent: string): Promise<number> {
    return 0;
  }

  private async assessBehaviorRisk(user: User, context: any): Promise<number> {
    return 0;
  }

  private async assessTimeRisk(user: User): Promise<number> {
    return 0;
  }

  private async assessVelocityRisk(user: User, context: any): Promise<number> {
    return 0;
  }

  private async createSession(user: User, context: { ipAddress: string; userAgent: string }, providerId: string): Promise<AuthenticationSession> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const token = jwt.sign(
      { 
        sub: user.id,
        sess: sessionId,
        roles: user.roles,
        groups: user.groups
      },
      process.env.JWT_SECRET || 'default-secret',
      {
        issuer: this.config.tokenConfig.issuer,
        audience: this.config.tokenConfig.audience,
        expiresIn: this.config.sessionConfig.maxDuration / 1000
      }
    );

    const session: AuthenticationSession = {
      id: sessionId,
      userId: user.id,
      providerId,
      token,
      expiresAt: new Date(Date.now() + this.config.sessionConfig.maxDuration),
      scope: ['read', 'write'],
      attributes: {},
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      created: new Date(),
      lastActivity: new Date(),
      revoked: false
    };

    this.sessions.set(sessionId, session);
    await this.saveSessions();

    return session;
  }

  private async evaluateAuthorization(context: AuthorizationContext): Promise<AuthorizationResult> {
    const { user, resource, action } = context;
    const permissions = await this.getUserPermissions(user.id);
    const applicablePolicies: AuthorizationPolicy[] = [];
    let finalDecision = false;

    for (const permission of permissions) {
      if (this.matchesResource(permission.resource, resource) && 
          this.matchesAction(permission.action, action)) {
        
        if (permission.conditions) {
          const conditionsMet = await this.evaluateConditions(permission.conditions, context);
          if (!conditionsMet) continue;
        }

        if (permission.effect === 'allow') {
          finalDecision = true;
        } else if (permission.effect === 'deny') {
          finalDecision = false;
          break;
        }
      }
    }

    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      const policyApplies = await this.evaluatePolicy(policy, context);
      if (policyApplies) {
        applicablePolicies.push(policy);
        
        if (policy.effect === 'deny') {
          finalDecision = false;
          break;
        } else if (policy.effect === 'allow') {
          finalDecision = true;
        }
      }
    }

    return {
      allowed: finalDecision,
      reason: finalDecision ? 'Authorized by permissions/policies' : 'Access denied by policies',
      policies: applicablePolicies
    };
  }

  private matchesResource(permissionResource: string, requestedResource: string): boolean {
    if (permissionResource === '*') return true;
    if (permissionResource === requestedResource) return true;
    
    if (permissionResource.endsWith('*')) {
      const prefix = permissionResource.slice(0, -1);
      return requestedResource.startsWith(prefix);
    }
    
    return false;
  }

  private matchesAction(permissionAction: string, requestedAction: string): boolean {
    if (permissionAction === '*') return true;
    if (permissionAction === requestedAction) return true;
    return false;
  }

  private async evaluateConditions(conditions: PolicyCondition[], context: any): Promise<boolean> {
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: PolicyCondition, context: any): boolean {
    const value = this.getContextValue(condition.attribute, context);
    
    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'ne': return value !== condition.value;
      case 'gt': return value > condition.value;
      case 'lt': return value < condition.value;
      case 'ge': return value >= condition.value;
      case 'le': return value <= condition.value;
      case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
      case 'not-in': return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'contains': return String(value).includes(String(condition.value));
      case 'regex': return new RegExp(condition.value).test(String(value));
      default: return false;
    }
  }

  private getContextValue(attribute: string, context: any): any {
    const parts = attribute.split('.');
    let current = context;
    
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  private async evaluatePolicy(policy: AuthorizationPolicy, context: AuthorizationContext): Promise<boolean> {
    if (!await this.evaluateConditions(policy.conditions, context)) {
      return false;
    }

    for (const rule of policy.rules) {
      if (await this.evaluateRule(rule, context)) {
        return true;
      }
    }

    return false;
  }

  private async evaluateRule(rule: PolicyRule, context: AuthorizationContext): Promise<boolean> {
    if (!this.matchesResource(rule.resource, context.resource) || 
        !this.matchesAction(rule.action, context.action)) {
      return false;
    }

    return await this.evaluateConditions(rule.conditions, context);
  }

  private async authenticateWithToken(token: string, context: any): Promise<AuthenticationResult> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      const sessionId = decoded.sess;
      const session = this.sessions.get(sessionId);

      if (!session || session.revoked || session.token !== token) {
        throw new MCPError('AUTH_ERROR', 'Invalid token');
      }

      const user = this.users.get(session.userId);
      if (!user || user.status !== 'active') {
        throw new MCPError('AUTH_ERROR', 'User not found or inactive');
      }

      session.lastActivity = new Date();
      
      return {
        success: true,
        user,
        session
      };
    } catch (error) {
      throw new MCPError('AUTH_ERROR', 'Token authentication failed');
    }
  }

  private async authenticateWithProvider(provider: AuthenticationProvider, credentials: any, context: any): Promise<AuthenticationResult> {
    throw new MCPError('AUTH_ERROR', 'External provider authentication not implemented');
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  private generateQRCode(user: User, secret: string): string {
    const issuer = this.config.tokenConfig.issuer;
    const accountName = user.email;
    return `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}`;
  }

  private async logAuthEvent(eventData: Omit<AuthenticationEvent, 'id' | 'timestamp'>): Promise<void> {
    const event: AuthenticationEvent = {
      ...eventData,
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    this.authEvents.push(event);

    const maxEvents = 10000;
    if (this.authEvents.length > maxEvents) {
      this.authEvents.splice(0, this.authEvents.length - maxEvents);
    }

    await this.saveAuthEvents();
  }

  private async saveUsers(): Promise<void> {
    const data = Array.from(this.users.values());
    await fs.writeFile(
      path.join(this.configPath, 'users.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveRoles(): Promise<void> {
    const data = Array.from(this.roles.values());
    await fs.writeFile(
      path.join(this.configPath, 'roles.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveGroups(): Promise<void> {
    const data = Array.from(this.groups.values());
    await fs.writeFile(
      path.join(this.configPath, 'groups.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveSessions(): Promise<void> {
    const data = Array.from(this.sessions.values());
    await fs.writeFile(
      path.join(this.configPath, 'sessions.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async savePolicies(): Promise<void> {
    const data = Array.from(this.policies.values());
    await fs.writeFile(
      path.join(this.configPath, 'policies.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveMFADevices(): Promise<void> {
    const data = Object.fromEntries(this.mfaDevices);
    await fs.writeFile(
      path.join(this.configPath, 'mfa-devices.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveAuthEvents(): Promise<void> {
    await fs.writeFile(
      path.join(this.configPath, 'auth-events.json'),
      JSON.stringify(this.authEvents, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalUsers = this.users.size;
    const activeUsers = Array.from(this.users.values()).filter(u => u.status === 'active').length;
    const activeSessions = Array.from(this.sessions.values()).filter(s => !s.revoked && s.expiresAt > new Date()).length;
    const totalRoles = this.roles.size;
    const totalPolicies = this.policies.size;

    return {
      status: 'healthy',
      totalUsers,
      activeUsers,
      activeSessions,
      totalRoles,
      totalPolicies,
      components: {
        authentication: 'healthy',
        authorization: 'healthy',
        sessions: 'healthy',
        mfa: 'healthy'
      },
      metrics: {
        loginsToday: this.getLoginsCount('today'),
        failedLoginsToday: this.getFailedLoginsCount('today'),
        averageSessionDuration: this.calculateAverageSessionDuration(),
        mfaAdoptionRate: this.calculateMFAAdoptionRate()
      }
    };
  }

  private getLoginsCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return this.authEvents.filter(event => 
      event.type === 'login' && event.success && event.timestamp >= startOfDay
    ).length;
  }

  private getFailedLoginsCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return this.authEvents.filter(event => 
      event.type === 'failed-login' && event.timestamp >= startOfDay
    ).length;
  }

  private calculateAverageSessionDuration(): number {
    const completedSessions = Array.from(this.sessions.values())
      .filter(s => s.revoked);
    
    if (completedSessions.length === 0) return 0;
    
    const totalDuration = completedSessions.reduce((sum, session) => {
      return sum + (session.lastActivity.getTime() - session.created.getTime());
    }, 0);
    
    return totalDuration / completedSessions.length;
  }

  private calculateMFAAdoptionRate(): number {
    const totalUsers = this.users.size;
    if (totalUsers === 0) return 0;
    
    const mfaEnabledUsers = Array.from(this.users.values())
      .filter(u => u.metadata.mfaEnabled).length;
    
    return (mfaEnabledUsers / totalUsers) * 100;
  }
}

interface AuthenticationResult {
  success: boolean;
  user?: User;
  session?: AuthenticationSession;
  requiresMFA?: boolean;
  userId?: string;
  message?: string;
  riskScore?: number;
}

interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  policies: AuthorizationPolicy[];
}

interface AuthorizationContext {
  user: User;
  session: AuthenticationSession;
  resource: string;
  action: string;
  [key: string]: any;
}

interface MFASetupResult {
  deviceId: string;
  secret?: string;
  backupCodes?: string[];
  qrCode?: string;
}

export class AuthenticationAuthorizationMCPServer extends BaseServer {
  private authService: AuthenticationAuthorizationService;

  constructor() {
    super('authentication-authorization');
    
    const config: SecurityConfig = {
      passwordPolicy: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true,
        preventReuseCount: 5,
        maxAge: 7776000000,
        lockoutThreshold: 5,
        lockoutDuration: 1800000
      },
      sessionConfig: {
        maxDuration: 3600000,
        idleTimeout: 1800000,
        maxConcurrentSessions: 5,
        requireMFA: false,
        bindToIP: false,
        secureTransport: true
      },
      mfaConfig: {
        required: false,
        allowedMethods: ['totp', 'sms', 'email'],
        gracePeriod: 604800000,
        backupCodesCount: 10,
        totpWindowSize: 1
      },
      tokenConfig: {
        accessTokenTTL: 3600000,
        refreshTokenTTL: 86400000,
        issuer: 'mcp-security-server',
        audience: 'mcp-clients',
        algorithm: 'HS256',
        secretRotationInterval: 2592000000
      },
      riskAssessment: {
        enabled: true,
        factors: [
          { type: 'location', weight: 0.3, enabled: true, config: {} },
          { type: 'device', weight: 0.2, enabled: true, config: {} },
          { type: 'behavior', weight: 0.3, enabled: true, config: {} },
          { type: 'time', weight: 0.1, enabled: true, config: {} },
          { type: 'velocity', weight: 0.1, enabled: true, config: {} }
        ],
        thresholds: { low: 25, medium: 50, high: 75 },
        actions: [
          { threshold: 'medium', action: 'challenge', config: {} },
          { threshold: 'high', action: 'block', config: {} }
        ]
      },
      auditConfig: {
        enabled: true,
        events: ['login', 'logout', 'failed-login', 'authorization', 'policy-change'],
        retention: 31536000000,
        encryption: true,
        compression: true,
        destinations: [
          { type: 'file', config: { path: './logs/audit.log' }, enabled: true }
        ]
      }
    };

    this.authService = new AuthenticationAuthorizationService(config);
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.authService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/users', async (req, res) => {
      try {
        const userId = await this.authService.createUser(req.body);
        res.json({ id: userId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/authenticate', async (req, res) => {
      try {
        const result = await this.authService.authenticate(req.body.credentials, {
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.get('User-Agent') || 'unknown'
        });
        res.json(result);
      } catch (error) {
        res.status(401).json({ error: error.message });
      }
    });

    this.app.post('/authorize', async (req, res) => {
      try {
        const result = await this.authService.authorize(
          req.body.sessionId,
          req.body.resource,
          req.body.action,
          req.body.context
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/roles', async (req, res) => {
      try {
        const roleId = await this.authService.createRole(req.body);
        res.json({ id: roleId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/policies', async (req, res) => {
      try {
        const policyId = await this.authService.createAuthorizationPolicy(req.body);
        res.json({ id: policyId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/users/:id/mfa', async (req, res) => {
      try {
        const result = await this.authService.enableMFA(
          req.params.id,
          req.body.deviceType,
          req.body.config
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/sessions/:id', async (req, res) => {
      try {
        await this.authService.revokeSession(req.params.id, req.body.reason);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/users/:id/permissions', async (req, res) => {
      try {
        const permissions = await this.authService.getUserPermissions(req.params.id);
        res.json(permissions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'create_user',
        description: 'Create a new user account',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'locked', 'pending'] },
            roles: { type: 'array', items: { type: 'string' } },
            groups: { type: 'array', items: { type: 'string' } },
            attributes: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['username', 'email', 'displayName']
        }
      },
      {
        name: 'authenticate',
        description: 'Authenticate a user',
        inputSchema: {
          type: 'object',
          properties: {
            credentials: {
              type: 'object',
              properties: {
                username: { type: 'string' },
                email: { type: 'string' },
                password: { type: 'string' },
                token: { type: 'string' },
                mfaCode: { type: 'string' },
                providerId: { type: 'string' }
              }
            },
            context: {
              type: 'object',
              properties: {
                ipAddress: { type: 'string' },
                userAgent: { type: 'string' }
              },
              required: ['ipAddress', 'userAgent']
            }
          },
          required: ['credentials', 'context']
        }
      },
      {
        name: 'authorize',
        description: 'Check user authorization for a resource action',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            resource: { type: 'string' },
            action: { type: 'string' },
            context: { type: 'object' }
          },
          required: ['sessionId', 'resource', 'action']
        }
      },
      {
        name: 'create_role',
        description: 'Create a new role',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            permissions: { type: 'array' },
            inherits: { type: 'array', items: { type: 'string' } },
            scope: { type: 'string', enum: ['global', 'resource', 'tenant'] },
            metadata: { type: 'object' }
          },
          required: ['name', 'description', 'permissions']
        }
      },
      {
        name: 'create_authorization_policy',
        description: 'Create a new authorization policy',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['role-based', 'attribute-based', 'rule-based', 'time-based'] },
            rules: { type: 'array' },
            effect: { type: 'string', enum: ['allow', 'deny'] },
            priority: { type: 'number' },
            enabled: { type: 'boolean' },
            conditions: { type: 'array' }
          },
          required: ['name', 'description', 'type', 'rules', 'effect']
        }
      },
      {
        name: 'enable_mfa',
        description: 'Enable multi-factor authentication for a user',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            deviceType: { type: 'string', enum: ['totp', 'sms', 'email'] },
            config: { type: 'object' }
          },
          required: ['userId', 'deviceType', 'config']
        }
      },
      {
        name: 'revoke_session',
        description: 'Revoke a user session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            reason: { type: 'string' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'get_user_permissions',
        description: 'Get all permissions for a user',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' }
          },
          required: ['userId']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'create_user':
        return { id: await this.authService.createUser(params) };

      case 'authenticate':
        return await this.authService.authenticate(params.credentials, params.context);

      case 'authorize':
        return await this.authService.authorize(params.sessionId, params.resource, params.action, params.context);

      case 'create_role':
        return { id: await this.authService.createRole(params) };

      case 'create_authorization_policy':
        return { id: await this.authService.createAuthorizationPolicy(params) };

      case 'enable_mfa':
        return await this.authService.enableMFA(params.userId, params.deviceType, params.config);

      case 'revoke_session':
        await this.authService.revokeSession(params.sessionId, params.reason);
        return { success: true };

      case 'get_user_permissions':
        return await this.authService.getUserPermissions(params.userId);

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}