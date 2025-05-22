import { EventEmitter } from 'events';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
  description?: string;
}

export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex';
  value: any;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  inherits?: string[];
  description?: string;
}

export interface AccessRequest {
  userId: string;
  resource: string;
  action: string;
  context?: Record<string, any>;
  environment?: AccessEnvironment;
}

export interface AccessEnvironment {
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
  location?: string;
  deviceId?: string;
  sessionId?: string;
}

export interface AccessResult {
  granted: boolean;
  reason?: string;
  requiredPermissions?: string[];
  matchedPermissions?: string[];
  conditions?: PermissionCondition[];
  ttl?: number;
}

export interface PolicyRule {
  id: string;
  name: string;
  condition: string;
  effect: 'allow' | 'deny';
  priority: number;
  resources?: string[];
  actions?: string[];
  subjects?: string[];
}

export interface AccessPolicy {
  id: string;
  name: string;
  rules: PolicyRule[];
  defaultEffect: 'allow' | 'deny';
  version: string;
}

export class AuthorizationService extends EventEmitter {
  private permissions = new Map<string, Permission>();
  private roles = new Map<string, Role>();
  private userRoles = new Map<string, string[]>();
  private policies = new Map<string, AccessPolicy>();
  private accessCache = new Map<string, { result: AccessResult; expiresAt: Date }>();

  constructor() {
    super();
    this.initializeDefaultPermissions();
    this.initializeDefaultRoles();
    this.startCacheCleanup();
  }

  async checkAccess(request: AccessRequest): Promise<AccessResult> {
    try {
      const cacheKey = this.generateCacheKey(request);
      const cached = this.accessCache.get(cacheKey);
      
      if (cached && cached.expiresAt > new Date()) {
        this.emit('accessCheckCached', { request, result: cached.result });
        return cached.result;
      }

      const userRoles = this.getUserRoles(request.userId);
      if (!userRoles.length) {
        const result: AccessResult = {
          granted: false,
          reason: 'User has no roles assigned'
        };
        this.emit('accessDenied', { request, result });
        return result;
      }

      // Get all permissions for user's roles
      const userPermissions = await this.getUserPermissions(userRoles);
      
      // Check resource-specific permissions
      const resourcePermissions = userPermissions.filter(perm => 
        this.matchesResource(perm.resource, request.resource) &&
        this.matchesAction(perm.action, request.action)
      );

      if (!resourcePermissions.length) {
        const result: AccessResult = {
          granted: false,
          reason: 'No matching permissions found',
          requiredPermissions: [`${request.action}:${request.resource}`]
        };
        this.emit('accessDenied', { request, result });
        return result;
      }

      // Evaluate permission conditions
      const conditionResults = await Promise.all(
        resourcePermissions.map(perm => this.evaluateConditions(perm, request))
      );

      const validPermissions = resourcePermissions.filter((_, index) => conditionResults[index]);

      if (!validPermissions.length) {
        const result: AccessResult = {
          granted: false,
          reason: 'Permission conditions not met',
          conditions: resourcePermissions.flatMap(p => p.conditions || [])
        };
        this.emit('accessDenied', { request, result });
        return result;
      }

      // Apply policies
      const policyResult = await this.evaluatePolicies(request, userRoles);
      if (!policyResult.granted) {
        this.emit('accessDenied', { request, result: policyResult });
        return policyResult;
      }

      const result: AccessResult = {
        granted: true,
        matchedPermissions: validPermissions.map(p => p.id),
        ttl: 300 // 5 minutes cache
      };

      // Cache the result
      this.accessCache.set(cacheKey, {
        result,
        expiresAt: new Date(Date.now() + (result.ttl || 300) * 1000)
      });

      this.emit('accessGranted', { request, result });
      return result;

    } catch (error) {
      this.emit('error', { operation: 'checkAccess', error, request });
      return {
        granted: false,
        reason: 'Access check failed due to error'
      };
    }
  }

  async assignRole(userId: string, roleId: string): Promise<boolean> {
    try {
      if (!this.roles.has(roleId)) {
        return false;
      }

      const userRoles = this.userRoles.get(userId) || [];
      if (!userRoles.includes(roleId)) {
        userRoles.push(roleId);
        this.userRoles.set(userId, userRoles);
        this.invalidateUserCache(userId);
        this.emit('roleAssigned', { userId, roleId });
      }

      return true;
    } catch (error) {
      this.emit('error', { operation: 'assignRole', error, userId, roleId });
      return false;
    }
  }

  async revokeRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const userRoles = this.userRoles.get(userId) || [];
      const index = userRoles.indexOf(roleId);
      
      if (index !== -1) {
        userRoles.splice(index, 1);
        this.userRoles.set(userId, userRoles);
        this.invalidateUserCache(userId);
        this.emit('roleRevoked', { userId, roleId });
      }

      return true;
    } catch (error) {
      this.emit('error', { operation: 'revokeRole', error, userId, roleId });
      return false;
    }
  }

  async createPermission(permission: Permission): Promise<boolean> {
    try {
      this.permissions.set(permission.id, permission);
      this.clearAccessCache();
      this.emit('permissionCreated', { permission });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'createPermission', error, permission });
      return false;
    }
  }

  async createRole(role: Role): Promise<boolean> {
    try {
      // Validate that all permissions exist
      for (const permId of role.permissions) {
        if (!this.permissions.has(permId)) {
          return false;
        }
      }

      this.roles.set(role.id, role);
      this.clearAccessCache();
      this.emit('roleCreated', { role });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'createRole', error, role });
      return false;
    }
  }

  async createPolicy(policy: AccessPolicy): Promise<boolean> {
    try {
      this.policies.set(policy.id, policy);
      this.clearAccessCache();
      this.emit('policyCreated', { policy });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'createPolicy', error, policy });
      return false;
    }
  }

  getUserRoles(userId: string): string[] {
    return this.userRoles.get(userId) || [];
  }

  async getUserPermissions(roleIds: string[]): Promise<Permission[]> {
    const permissions: Permission[] = [];
    const processedRoles = new Set<string>();

    const processRole = (roleId: string) => {
      if (processedRoles.has(roleId)) return;
      processedRoles.add(roleId);

      const role = this.roles.get(roleId);
      if (!role) return;

      // Process inherited roles first
      if (role.inherits) {
        role.inherits.forEach(inheritedRoleId => processRole(inheritedRoleId));
      }

      // Add role permissions
      role.permissions.forEach(permId => {
        const permission = this.permissions.get(permId);
        if (permission && !permissions.find(p => p.id === permission.id)) {
          permissions.push(permission);
        }
      });
    };

    roleIds.forEach(roleId => processRole(roleId));
    return permissions;
  }

  private async evaluateConditions(permission: Permission, request: AccessRequest): Promise<boolean> {
    if (!permission.conditions?.length) {
      return true;
    }

    for (const condition of permission.conditions) {
      if (!this.evaluateCondition(condition, request)) {
        return false;
      }
    }

    return true;
  }

  private evaluateCondition(condition: PermissionCondition, request: AccessRequest): boolean {
    const contextValue = request.context?.[condition.field] || 
                        request.environment?.[condition.field as keyof AccessEnvironment];

    switch (condition.operator) {
      case 'eq':
        return contextValue === condition.value;
      case 'ne':
        return contextValue !== condition.value;
      case 'gt':
        return contextValue > condition.value;
      case 'gte':
        return contextValue >= condition.value;
      case 'lt':
        return contextValue < condition.value;
      case 'lte':
        return contextValue <= condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'nin':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);
      case 'contains':
        return typeof contextValue === 'string' && contextValue.includes(condition.value);
      case 'regex':
        return typeof contextValue === 'string' && new RegExp(condition.value).test(contextValue);
      default:
        return false;
    }
  }

  private async evaluatePolicies(request: AccessRequest, userRoles: string[]): Promise<AccessResult> {
    const applicablePolicies = Array.from(this.policies.values())
      .filter(policy => this.policyApplies(policy, request, userRoles));

    if (!applicablePolicies.length) {
      return { granted: true };
    }

    // Evaluate rules in priority order
    const allRules = applicablePolicies
      .flatMap(policy => policy.rules.map(rule => ({ ...rule, policyId: policy.id })))
      .sort((a, b) => b.priority - a.priority);

    for (const rule of allRules) {
      if (this.ruleApplies(rule, request, userRoles)) {
        if (rule.effect === 'deny') {
          return {
            granted: false,
            reason: `Access denied by policy rule: ${rule.name}`
          };
        }
        // Allow effect - continue checking other rules
      }
    }

    return { granted: true };
  }

  private policyApplies(policy: AccessPolicy, request: AccessRequest, userRoles: string[]): boolean {
    return policy.rules.some(rule => this.ruleApplies(rule, request, userRoles));
  }

  private ruleApplies(rule: PolicyRule, request: AccessRequest, userRoles: string[]): boolean {
    // Check subjects (roles)
    if (rule.subjects?.length && !rule.subjects.some(subject => userRoles.includes(subject))) {
      return false;
    }

    // Check resources
    if (rule.resources?.length && !rule.resources.some(resource => 
      this.matchesResource(resource, request.resource))) {
      return false;
    }

    // Check actions
    if (rule.actions?.length && !rule.actions.some(action => 
      this.matchesAction(action, request.action))) {
      return false;
    }

    // Evaluate condition expression
    if (rule.condition) {
      return this.evaluateConditionExpression(rule.condition, request);
    }

    return true;
  }

  private evaluateConditionExpression(condition: string, request: AccessRequest): boolean {
    // Simplified condition evaluation - in production use proper expression parser
    try {
      const context = {
        ...request.context,
        ...request.environment,
        userId: request.userId,
        resource: request.resource,
        action: request.action
      };

      // Replace variables in condition
      let expression = condition;
      for (const [key, value] of Object.entries(context)) {
        expression = expression.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), JSON.stringify(value));
      }

      // Basic evaluation - in production use safe expression evaluator
      return eval(expression) === true;
    } catch {
      return false;
    }
  }

  private matchesResource(permissionResource: string, requestResource: string): boolean {
    if (permissionResource === '*') return true;
    if (permissionResource === requestResource) return true;
    
    // Support wildcard patterns
    const pattern = permissionResource.replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(requestResource);
  }

  private matchesAction(permissionAction: string, requestAction: string): boolean {
    if (permissionAction === '*') return true;
    if (permissionAction === requestAction) return true;

    // Support wildcard patterns
    const pattern = permissionAction.replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(requestAction);
  }

  private generateCacheKey(request: AccessRequest): string {
    const key = `${request.userId}:${request.resource}:${request.action}`;
    if (request.context) {
      return `${key}:${JSON.stringify(request.context)}`;
    }
    return key;
  }

  private invalidateUserCache(userId: string): void {
    for (const [key, _] of this.accessCache.entries()) {
      if (key.startsWith(`${userId}:`)) {
        this.accessCache.delete(key);
      }
    }
  }

  private clearAccessCache(): void {
    this.accessCache.clear();
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = new Date();
      for (const [key, cached] of this.accessCache.entries()) {
        if (cached.expiresAt < now) {
          this.accessCache.delete(key);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private initializeDefaultPermissions(): void {
    const defaultPermissions: Permission[] = [
      {
        id: 'read:profile',
        name: 'Read Profile',
        resource: 'profile',
        action: 'read'
      },
      {
        id: 'update:profile',
        name: 'Update Profile',
        resource: 'profile',
        action: 'update'
      },
      {
        id: 'read:api',
        name: 'Read API',
        resource: 'api',
        action: 'read'
      },
      {
        id: 'write:api',
        name: 'Write API',
        resource: 'api',
        action: 'write'
      },
      {
        id: 'admin:all',
        name: 'Admin All',
        resource: '*',
        action: '*'
      }
    ];

    defaultPermissions.forEach(perm => this.permissions.set(perm.id, perm));
  }

  private initializeDefaultRoles(): void {
    const defaultRoles: Role[] = [
      {
        id: 'user',
        name: 'User',
        permissions: ['read:profile', 'update:profile']
      },
      {
        id: 'api',
        name: 'API User',
        permissions: ['read:api', 'write:api'],
        inherits: ['user']
      },
      {
        id: 'admin',
        name: 'Administrator',
        permissions: ['admin:all']
      }
    ];

    defaultRoles.forEach(role => this.roles.set(role.id, role));
  }
}