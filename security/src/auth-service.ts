import { EventEmitter } from 'events';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

export interface AuthConfig {
  jwtSecret: string;
  tokenExpiry: string;
  refreshTokenExpiry: string;
  passwordPolicy: PasswordPolicy;
  mfaRequired: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;
  preventReuse: number;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  passwordHistory: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  scope: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
  deviceId?: string;
  ipAddress: string;
  userAgent: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: AuthToken;
  error?: string;
  requiresMfa?: boolean;
  isLocked?: boolean;
  lockoutEnds?: Date;
}

export class AuthenticationService extends EventEmitter {
  private users = new Map<string, User>();
  private refreshTokens = new Map<string, { userId: string; expiresAt: Date }>();
  private sessions = new Map<string, { userId: string; createdAt: Date; lastActivity: Date }>();

  constructor(private config: AuthConfig) {
    super();
    this.startCleanupTimer();
  }

  async registerUser(
    email: string,
    password: string,
    roles: string[] = ['user']
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      if (this.getUserByEmail(email)) {
        return { success: false, error: 'User already exists' };
      }

      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
      }

      const salt = randomBytes(32).toString('hex');
      const passwordHash = this.hashPassword(password, salt);

      const user: User = {
        id: randomBytes(16).toString('hex'),
        email,
        passwordHash,
        salt,
        roles,
        permissions: await this.getPermissionsForRoles(roles),
        mfaEnabled: this.config.mfaRequired,
        loginAttempts: 0,
        passwordHistory: [passwordHash],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.users.set(user.id, user);
      this.emit('userRegistered', { user: this.sanitizeUser(user) });

      return { success: true, user: this.sanitizeUser(user) };
    } catch (error) {
      this.emit('error', { operation: 'registerUser', error });
      return { success: false, error: 'Registration failed' };
    }
  }

  async authenticate(request: LoginRequest): Promise<AuthResult> {
    try {
      const user = this.getUserByEmail(request.email);
      if (!user) {
        this.emit('authenticationFailed', { 
          email: request.email, 
          reason: 'user_not_found',
          ipAddress: request.ipAddress 
        });
        return { success: false, error: 'Invalid credentials' };
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { 
          success: false, 
          error: 'Account locked', 
          isLocked: true, 
          lockoutEnds: user.lockedUntil 
        };
      }

      const passwordValid = this.verifyPassword(request.password, user.passwordHash, user.salt);
      if (!passwordValid) {
        await this.handleFailedLogin(user);
        this.emit('authenticationFailed', { 
          userId: user.id, 
          reason: 'invalid_password',
          ipAddress: request.ipAddress 
        });
        return { success: false, error: 'Invalid credentials' };
      }

      if (user.mfaEnabled && !request.mfaCode) {
        return { success: false, requiresMfa: true };
      }

      if (user.mfaEnabled && request.mfaCode) {
        const mfaValid = await this.verifyMfaCode(user, request.mfaCode);
        if (!mfaValid) {
          await this.handleFailedLogin(user);
          this.emit('authenticationFailed', { 
            userId: user.id, 
            reason: 'invalid_mfa',
            ipAddress: request.ipAddress 
          });
          return { success: false, error: 'Invalid MFA code' };
        }
      }

      await this.handleSuccessfulLogin(user);
      const token = await this.generateToken(user);
      const sessionId = await this.createSession(user.id);

      this.emit('authenticationSucceeded', { 
        userId: user.id, 
        sessionId,
        ipAddress: request.ipAddress 
      });

      return { 
        success: true, 
        user: this.sanitizeUser(user), 
        token 
      };
    } catch (error) {
      this.emit('error', { operation: 'authenticate', error });
      return { success: false, error: 'Authentication failed' };
    }
  }

  async refreshToken(refreshToken: string): Promise<{ success: boolean; token?: AuthToken; error?: string }> {
    try {
      const tokenData = this.refreshTokens.get(refreshToken);
      if (!tokenData || tokenData.expiresAt < new Date()) {
        return { success: false, error: 'Invalid refresh token' };
      }

      const user = this.users.get(tokenData.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      this.refreshTokens.delete(refreshToken);
      const newToken = await this.generateToken(user);

      return { success: true, token: newToken };
    } catch (error) {
      this.emit('error', { operation: 'refreshToken', error });
      return { success: false, error: 'Token refresh failed' };
    }
  }

  async validateToken(token: string): Promise<{ valid: boolean; user?: User; error?: string }> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as any;
      const user = this.users.get(decoded.userId);
      
      if (!user) {
        return { valid: false, error: 'User not found' };
      }

      return { valid: true, user: this.sanitizeUser(user) };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }

  async logout(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.emit('userLoggedOut', { sessionId });
  }

  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const user = this.users.get(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const currentPasswordValid = this.verifyPassword(currentPassword, user.passwordHash, user.salt);
      if (!currentPasswordValid) {
        return { success: false, error: 'Current password incorrect' };
      }

      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
      }

      const newPasswordHash = this.hashPassword(newPassword, user.salt);
      
      if (user.passwordHistory.includes(newPasswordHash)) {
        return { success: false, error: 'Cannot reuse recent passwords' };
      }

      user.passwordHash = newPasswordHash;
      user.passwordHistory.push(newPasswordHash);
      
      if (user.passwordHistory.length > this.config.passwordPolicy.preventReuse) {
        user.passwordHistory = user.passwordHistory.slice(-this.config.passwordPolicy.preventReuse);
      }

      user.updatedAt = new Date();
      this.emit('passwordChanged', { userId });

      return { success: true };
    } catch (error) {
      this.emit('error', { operation: 'changePassword', error });
      return { success: false, error: 'Password change failed' };
    }
  }

  private async handleFailedLogin(user: User): Promise<void> {
    user.loginAttempts += 1;
    
    if (user.loginAttempts >= this.config.maxLoginAttempts) {
      user.lockedUntil = new Date(Date.now() + this.config.lockoutDuration);
      user.loginAttempts = 0;
      this.emit('accountLocked', { userId: user.id, lockedUntil: user.lockedUntil });
    }
    
    user.updatedAt = new Date();
  }

  private async handleSuccessfulLogin(user: User): Promise<void> {
    user.loginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLogin = new Date();
    user.updatedAt = new Date();
  }

  private async generateToken(user: User): Promise<AuthToken> {
    const payload = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions
    };

    const accessToken = jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.tokenExpiry,
      issuer: 'claude-mcp-server',
      audience: 'api'
    });

    const refreshToken = randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setTime(refreshExpiresAt.getTime() + 
      this.parseExpiry(this.config.refreshTokenExpiry));

    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      expiresAt: refreshExpiresAt
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(this.config.tokenExpiry),
      tokenType: 'Bearer',
      scope: user.permissions
    };
  }

  private async createSession(userId: string): Promise<string> {
    const sessionId = randomBytes(32).toString('hex');
    const now = new Date();
    
    this.sessions.set(sessionId, {
      userId,
      createdAt: now,
      lastActivity: now
    });

    return sessionId;
  }

  private validatePassword(password: string): { valid: boolean; error?: string } {
    const policy = this.config.passwordPolicy;

    if (password.length < policy.minLength) {
      return { valid: false, error: `Password must be at least ${policy.minLength} characters` };
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      return { valid: false, error: 'Password must contain uppercase letters' };
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      return { valid: false, error: 'Password must contain lowercase letters' };
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      return { valid: false, error: 'Password must contain numbers' };
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return { valid: false, error: 'Password must contain special characters' };
    }

    return { valid: true };
  }

  private hashPassword(password: string, salt: string): string {
    return createHash('pbkdf2')
      .update(password + salt)
      .digest('hex');
  }

  private verifyPassword(password: string, hash: string, salt: string): boolean {
    const passwordHash = this.hashPassword(password, salt);
    return timingSafeEqual(Buffer.from(hash), Buffer.from(passwordHash));
  }

  private async verifyMfaCode(user: User, code: string): Promise<boolean> {
    // Simplified MFA verification - in production use proper TOTP library
    return code === '123456';
  }

  private getUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  private async getPermissionsForRoles(roles: string[]): Promise<string[]> {
    const rolePermissions: Record<string, string[]> = {
      'admin': ['*'],
      'user': ['read:profile', 'update:profile'],
      'api': ['read:api', 'write:api'],
      'analytics': ['read:analytics', 'write:analytics']
    };

    const permissions = new Set<string>();
    for (const role of roles) {
      const rolePerms = rolePermissions[role] || [];
      rolePerms.forEach(perm => permissions.add(perm));
    }

    return Array.from(permissions);
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash' | 'salt' | 'mfaSecret' | 'passwordHistory'> {
    const { passwordHash, salt, mfaSecret, passwordHistory, ...sanitized } = user;
    return sanitized;
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 3600000; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 3600000;
    }
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredTokens();
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.expiresAt < now) {
        this.refreshTokens.delete(token);
      }
    }
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    const maxInactivity = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > maxInactivity) {
        this.sessions.delete(sessionId);
      }
    }
  }
}