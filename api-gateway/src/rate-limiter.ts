import { EventEmitter } from 'events';

export interface RateLimitRule {
  id: string;
  name: string;
  requests: number;
  window: number; // seconds
  burst?: number;
  keyGenerator: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (key: string, rule: RateLimitRule) => void;
  whitelist?: string[];
  blacklist?: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  burstTokens: number;
}

interface SlidingWindowEntry {
  timestamp: number;
  count: number;
}

export class RateLimiter extends EventEmitter {
  private tokenBuckets = new Map<string, TokenBucket>();
  private slidingWindows = new Map<string, SlidingWindowEntry[]>();
  private rules = new Map<string, RateLimitRule>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.startCleanup();
  }

  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule-added', rule);
  }

  removeRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.delete(ruleId);
      this.emit('rule-removed', rule);
    }
  }

  async checkLimit(ruleId: string, request: any, response?: any): Promise<RateLimitResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rate limit rule not found: ${ruleId}`);
    }

    const key = rule.keyGenerator(request);

    // Check whitelist/blacklist
    if (rule.whitelist && rule.whitelist.includes(key)) {
      return {
        allowed: true,
        remaining: rule.requests,
        resetTime: Date.now() + (rule.window * 1000)
      };
    }

    if (rule.blacklist && rule.blacklist.includes(key)) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + (rule.window * 1000),
        retryAfter: rule.window
      };
    }

    // Skip based on request/response status
    if (response) {
      const isSuccessful = response.statusCode >= 200 && response.statusCode < 300;
      const isFailed = response.statusCode >= 400;

      if (rule.skipSuccessfulRequests && isSuccessful) {
        return {
          allowed: true,
          remaining: rule.requests,
          resetTime: Date.now() + (rule.window * 1000)
        };
      }

      if (rule.skipFailedRequests && isFailed) {
        return {
          allowed: true,
          remaining: rule.requests,
          resetTime: Date.now() + (rule.window * 1000)
        };
      }
    }

    // Use token bucket for burst handling, sliding window for precise rate limiting
    const result = rule.burst 
      ? this.checkTokenBucket(key, rule)
      : this.checkSlidingWindow(key, rule);

    if (!result.allowed && rule.onLimitReached) {
      rule.onLimitReached(key, rule);
    }

    this.emit('limit-check', {
      rule: rule.id,
      key,
      allowed: result.allowed,
      remaining: result.remaining,
      timestamp: Date.now()
    });

    return result;
  }

  private checkTokenBucket(key: string, rule: RateLimitRule): RateLimitResult {
    const bucketKey = `${rule.id}:${key}`;
    const now = Date.now();
    
    let bucket = this.tokenBuckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: rule.requests,
        lastRefill: now,
        burstTokens: rule.burst || 0
      };
      this.tokenBuckets.set(bucketKey, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(elapsed * (rule.requests / rule.window));
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(rule.requests, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Check if request can be allowed
    if (bucket.tokens > 0) {
      bucket.tokens--;
      return {
        allowed: true,
        remaining: bucket.tokens,
        resetTime: now + (rule.window * 1000)
      };
    }

    // Check burst tokens
    if (bucket.burstTokens > 0) {
      bucket.burstTokens--;
      return {
        allowed: true,
        remaining: 0,
        resetTime: now + (rule.window * 1000)
      };
    }

    // Calculate retry after
    const timeToNextToken = rule.window / rule.requests;
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: now + (rule.window * 1000),
      retryAfter: Math.ceil(timeToNextToken)
    };
  }

  private checkSlidingWindow(key: string, rule: RateLimitRule): RateLimitResult {
    const windowKey = `${rule.id}:${key}`;
    const now = Date.now();
    const windowStart = now - (rule.window * 1000);
    
    let window = this.slidingWindows.get(windowKey) || [];
    
    // Remove expired entries
    window = window.filter(entry => entry.timestamp > windowStart);
    
    // Count requests in current window
    const requestCount = window.reduce((sum, entry) => sum + entry.count, 0);
    
    if (requestCount >= rule.requests) {
      // Find oldest entry to calculate retry after
      const oldestEntry = window[0];
      const retryAfter = oldestEntry 
        ? Math.ceil((oldestEntry.timestamp + (rule.window * 1000) - now) / 1000)
        : rule.window;
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + (retryAfter * 1000),
        retryAfter
      };
    }

    // Add current request
    window.push({
      timestamp: now,
      count: 1
    });
    
    this.slidingWindows.set(windowKey, window);
    
    return {
      allowed: true,
      remaining: rule.requests - requestCount - 1,
      resetTime: now + (rule.window * 1000)
    };
  }

  createIPBasedRule(ruleId: string, requests: number, window: number, options: Partial<RateLimitRule> = {}): RateLimitRule {
    return {
      id: ruleId,
      name: options.name || `IP Rate Limit - ${requests}/${window}s`,
      requests,
      window,
      keyGenerator: (req: any) => this.getClientIP(req),
      ...options
    };
  }

  createUserBasedRule(ruleId: string, requests: number, window: number, options: Partial<RateLimitRule> = {}): RateLimitRule {
    return {
      id: ruleId,
      name: options.name || `User Rate Limit - ${requests}/${window}s`,
      requests,
      window,
      keyGenerator: (req: any) => req.user?.id || req.headers?.['x-user-id'] || 'anonymous',
      ...options
    };
  }

  createAPIKeyBasedRule(ruleId: string, requests: number, window: number, options: Partial<RateLimitRule> = {}): RateLimitRule {
    return {
      id: ruleId,
      name: options.name || `API Key Rate Limit - ${requests}/${window}s`,
      requests,
      window,
      keyGenerator: (req: any) => {
        const authHeader = req.headers?.authorization || '';
        if (authHeader.startsWith('ApiKey ')) {
          return authHeader.substring(7);
        }
        return req.headers?.['x-api-key'] || 'no-key';
      },
      ...options
    };
  }

  createEndpointBasedRule(ruleId: string, requests: number, window: number, options: Partial<RateLimitRule> = {}): RateLimitRule {
    return {
      id: ruleId,
      name: options.name || `Endpoint Rate Limit - ${requests}/${window}s`,
      requests,
      window,
      keyGenerator: (req: any) => `${req.method}:${req.url}:${this.getClientIP(req)}`,
      ...options
    };
  }

  private getClientIP(req: any): string {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      // Cleanup old sliding window entries
      for (const [key, window] of this.slidingWindows) {
        const ruleId = key.split(':')[0];
        const rule = this.rules.get(ruleId);
        
        if (rule) {
          const windowStart = now - (rule.window * 1000);
          const filteredWindow = window.filter(entry => entry.timestamp > windowStart);
          
          if (filteredWindow.length === 0) {
            this.slidingWindows.delete(key);
          } else {
            this.slidingWindows.set(key, filteredWindow);
          }
        }
      }
      
      // Cleanup old token buckets
      for (const [key, bucket] of this.tokenBuckets) {
        const ruleId = key.split(':')[0];
        const rule = this.rules.get(ruleId);
        
        if (rule) {
          const elapsed = (now - bucket.lastRefill) / 1000;
          if (elapsed > rule.window * 2) { // Keep buckets for 2x window duration
            this.tokenBuckets.delete(key);
          }
        }
      }
    }, 60000); // Cleanup every minute
  }

  getStats(): any {
    const stats = {
      rules: Array.from(this.rules.values()).map(rule => ({
        id: rule.id,
        name: rule.name,
        requests: rule.requests,
        window: rule.window,
        burst: rule.burst
      })),
      activeBuckets: this.tokenBuckets.size,
      activeWindows: this.slidingWindows.size,
      memoryUsage: {
        buckets: this.tokenBuckets.size * 64, // Approximate bytes
        windows: Array.from(this.slidingWindows.values())
          .reduce((sum, window) => sum + window.length * 16, 0)
      }
    };

    return stats;
  }

  reset(key?: string): void {
    if (key) {
      // Reset specific key across all rules
      for (const bucketKey of this.tokenBuckets.keys()) {
        if (bucketKey.endsWith(`:${key}`)) {
          this.tokenBuckets.delete(bucketKey);
        }
      }
      
      for (const windowKey of this.slidingWindows.keys()) {
        if (windowKey.endsWith(`:${key}`)) {
          this.slidingWindows.delete(windowKey);
        }
      }
      
      this.emit('reset', { key });
    } else {
      // Reset all
      this.tokenBuckets.clear();
      this.slidingWindows.clear();
      this.emit('reset', { all: true });
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.tokenBuckets.clear();
    this.slidingWindows.clear();
    this.rules.clear();
    this.removeAllListeners();
  }
}