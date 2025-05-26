import { BaseServer } from '../../shared/src/base-server';
import { MCPError } from '../../shared/src/errors';
import { withPerformanceMonitoring } from '../../shared/src/monitoring';
import { withRetry } from '../../shared/src/retry';
import { HealthChecker } from '../../shared/src/health';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CryptographicKey {
  id: string;
  name: string;
  type: 'symmetric' | 'asymmetric' | 'signing' | 'key-derivation';
  algorithm: string;
  purpose: string[];
  keySize: number;
  publicKey?: string;
  privateKey?: string;
  symmetricKey?: string;
  status: 'active' | 'inactive' | 'revoked' | 'compromised';
  metadata: {
    created: Date;
    expires?: Date;
    lastUsed?: Date;
    usageCount: number;
    tags: string[];
    owner: string;
    permissions: KeyPermission[];
  };
  rotationPolicy?: RotationPolicy;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface KeyPermission {
  principal: string;
  operations: KeyOperation[];
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  type: 'time' | 'location' | 'purpose' | 'rate-limit';
  value: any;
}

export type KeyOperation = 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'derive' | 'export' | 'import' | 'rotate' | 'revoke';

export interface RotationPolicy {
  enabled: boolean;
  interval: number;
  autoRotate: boolean;
  retainVersions: number;
  notifyBeforeExpiry: number;
  gracePeriod: number;
}

export interface EncryptionRequest {
  keyId: string;
  plaintext: string | Buffer;
  algorithm?: string;
  parameters?: EncryptionParameters;
  context?: Record<string, string>;
}

export interface EncryptionParameters {
  iv?: string;
  aad?: string;
  tagLength?: number;
  padding?: string;
  mode?: string;
}

export interface EncryptionResult {
  ciphertext: string;
  algorithm: string;
  parameters: EncryptionParameters;
  keyId: string;
  timestamp: Date;
  context?: Record<string, string>;
}

export interface DecryptionRequest {
  keyId: string;
  ciphertext: string;
  algorithm: string;
  parameters: EncryptionParameters;
  context?: Record<string, string>;
}

export interface DecryptionResult {
  plaintext: string;
  keyId: string;
  timestamp: Date;
  verified: boolean;
}

export interface SigningRequest {
  keyId: string;
  data: string | Buffer;
  algorithm?: string;
  format?: 'raw' | 'der' | 'pem';
  context?: Record<string, string>;
}

export interface SigningResult {
  signature: string;
  algorithm: string;
  keyId: string;
  timestamp: Date;
  format: string;
}

export interface VerificationRequest {
  keyId: string;
  data: string | Buffer;
  signature: string;
  algorithm: string;
  format?: 'raw' | 'der' | 'pem';
  context?: Record<string, string>;
}

export interface VerificationResult {
  valid: boolean;
  keyId: string;
  timestamp: Date;
  algorithm: string;
}

export interface HashRequest {
  data: string | Buffer;
  algorithm: 'sha256' | 'sha384' | 'sha512' | 'sha3-256' | 'sha3-384' | 'sha3-512' | 'blake2b' | 'blake2s';
  salt?: string;
  iterations?: number;
}

export interface HashResult {
  hash: string;
  algorithm: string;
  salt?: string;
  iterations?: number;
  timestamp: Date;
}

export interface KeyDerivationRequest {
  password: string;
  salt?: string;
  iterations?: number;
  keyLength?: number;
  algorithm?: 'pbkdf2' | 'scrypt' | 'argon2';
  parameters?: Record<string, any>;
}

export interface KeyDerivationResult {
  derivedKey: string;
  salt: string;
  iterations: number;
  algorithm: string;
  keyLength: number;
  timestamp: Date;
}

export interface CertificateRequest {
  keyId: string;
  subject: CertificateSubject;
  validity: {
    notBefore: Date;
    notAfter: Date;
  };
  extensions?: CertificateExtension[];
  issuerCertId?: string;
  selfSigned?: boolean;
}

export interface CertificateSubject {
  commonName: string;
  organizationName?: string;
  organizationalUnit?: string;
  countryName?: string;
  stateOrProvinceName?: string;
  localityName?: string;
  emailAddress?: string;
}

export interface CertificateExtension {
  oid: string;
  critical: boolean;
  value: any;
}

export interface Certificate {
  id: string;
  keyId: string;
  certificate: string;
  format: 'pem' | 'der';
  serialNumber: string;
  subject: CertificateSubject;
  issuer: CertificateSubject;
  validity: {
    notBefore: Date;
    notAfter: Date;
  };
  extensions: CertificateExtension[];
  fingerprint: string;
  status: 'valid' | 'expired' | 'revoked' | 'suspended';
  created: Date;
}

export interface HSMConfiguration {
  enabled: boolean;
  provider: 'software' | 'aws-kms' | 'azure-kv' | 'gcp-kms' | 'pkcs11';
  config: Record<string, any>;
  keyStoragePolicy: 'hsm-only' | 'hsm-preferred' | 'software-allowed';
}

export interface CryptoOperation {
  id: string;
  type: 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'hash' | 'derive' | 'generate';
  keyId?: string;
  algorithm: string;
  status: 'pending' | 'completed' | 'failed';
  requestor: string;
  timestamp: Date;
  duration?: number;
  inputSize?: number;
  outputSize?: number;
  context?: Record<string, string>;
  error?: string;
}

export interface CryptographyConfig {
  defaultAlgorithms: {
    symmetric: string;
    asymmetric: string;
    signing: string;
    hashing: string;
    keyDerivation: string;
  };
  keyManagement: {
    defaultRotationInterval: number;
    maxKeyAge: number;
    retainRevokedKeys: boolean;
    enableKeyVersioning: boolean;
  };
  securityPolicies: {
    minimumKeySize: Record<string, number>;
    allowedAlgorithms: string[];
    forbiddenAlgorithms: string[];
    requireHSM: boolean;
  };
  auditConfig: {
    logAllOperations: boolean;
    logFailuresOnly: boolean;
    retention: number;
  };
  hsmConfig?: HSMConfiguration;
}

export class CryptographyService {
  private config: CryptographyConfig;
  private keys: Map<string, CryptographicKey> = new Map();
  private certificates: Map<string, Certificate> = new Map();
  private operations: CryptoOperation[] = [];
  private keyVersions: Map<string, CryptographicKey[]> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(config: CryptographyConfig, configPath: string = './data/cryptography') {
    this.config = config;
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
  }

  async generateKey(keySpec: {
    name: string;
    type: 'symmetric' | 'asymmetric' | 'signing' | 'key-derivation';
    algorithm: string;
    keySize?: number;
    purpose: string[];
    owner: string;
    securityLevel?: 'low' | 'medium' | 'high' | 'critical';
    rotationPolicy?: RotationPolicy;
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      this.validateAlgorithm(keySpec.algorithm);
      this.validateKeySize(keySpec.algorithm, keySpec.keySize);

      const keyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const keySize = keySpec.keySize || this.getDefaultKeySize(keySpec.algorithm);

      let publicKey: string | undefined;
      let privateKey: string | undefined;
      let symmetricKey: string | undefined;

      switch (keySpec.type) {
        case 'symmetric':
          symmetricKey = this.generateSymmetricKey(keySpec.algorithm, keySize);
          break;
        case 'asymmetric':
        case 'signing':
          const keyPair = this.generateAsymmetricKeyPair(keySpec.algorithm, keySize);
          publicKey = keyPair.publicKey;
          privateKey = keyPair.privateKey;
          break;
        case 'key-derivation':
          symmetricKey = this.generateSymmetricKey('aes-256-gcm', 256);
          break;
      }

      const key: CryptographicKey = {
        id: keyId,
        name: keySpec.name,
        type: keySpec.type,
        algorithm: keySpec.algorithm,
        purpose: keySpec.purpose,
        keySize,
        publicKey,
        privateKey,
        symmetricKey,
        status: 'active',
        metadata: {
          created: new Date(),
          usageCount: 0,
          tags: keySpec.metadata?.tags || [],
          owner: keySpec.owner,
          permissions: [{
            principal: keySpec.owner,
            operations: ['encrypt', 'decrypt', 'sign', 'verify', 'derive', 'rotate'],
            conditions: []
          }]
        },
        rotationPolicy: keySpec.rotationPolicy,
        securityLevel: keySpec.securityLevel || 'medium'
      };

      this.keys.set(keyId, key);
      await this.saveKeys();

      await this.logOperation({
        type: 'generate',
        keyId,
        algorithm: keySpec.algorithm,
        requestor: keySpec.owner,
        status: 'completed'
      });

      return keyId;
    } catch (error) {
      throw new MCPError('CRYPTO_ERROR', `Failed to generate key: ${error}`);
    }
  }

  async encrypt(request: EncryptionRequest, requestor: string): Promise<EncryptionResult> {
    try {
      const key = this.keys.get(request.keyId);
      if (!key) {
        throw new MCPError('CRYPTO_ERROR', `Key ${request.keyId} not found`);
      }

      this.checkKeyPermissions(key, requestor, 'encrypt');
      this.validateKeyStatus(key);

      const algorithm = request.algorithm || this.getDefaultAlgorithm(key);
      const plaintext = typeof request.plaintext === 'string' ? 
        Buffer.from(request.plaintext, 'utf8') : request.plaintext;

      let ciphertext: Buffer;
      let parameters: EncryptionParameters = request.parameters || {};

      switch (algorithm) {
        case 'aes-256-gcm':
          const result = this.encryptAESGCM(key.symmetricKey!, plaintext, parameters);
          ciphertext = result.ciphertext;
          parameters = result.parameters;
          break;
        case 'aes-256-cbc':
          const cbcResult = this.encryptAESCBC(key.symmetricKey!, plaintext, parameters);
          ciphertext = cbcResult.ciphertext;
          parameters = cbcResult.parameters;
          break;
        case 'rsa-oaep':
          ciphertext = this.encryptRSAOAEP(key.publicKey!, plaintext);
          break;
        default:
          throw new MCPError('CRYPTO_ERROR', `Unsupported encryption algorithm: ${algorithm}`);
      }

      key.metadata.usageCount++;
      key.metadata.lastUsed = new Date();
      await this.saveKeys();

      const encryptionResult: EncryptionResult = {
        ciphertext: ciphertext.toString('base64'),
        algorithm,
        parameters,
        keyId: request.keyId,
        timestamp: new Date(),
        context: request.context
      };

      await this.logOperation({
        type: 'encrypt',
        keyId: request.keyId,
        algorithm,
        requestor,
        status: 'completed',
        inputSize: plaintext.length,
        outputSize: ciphertext.length
      });

      return encryptionResult;
    } catch (error) {
      await this.logOperation({
        type: 'encrypt',
        keyId: request.keyId,
        algorithm: request.algorithm || 'unknown',
        requestor,
        status: 'failed',
        error: error.message
      });
      throw new MCPError('CRYPTO_ERROR', `Encryption failed: ${error}`);
    }
  }

  async decrypt(request: DecryptionRequest, requestor: string): Promise<DecryptionResult> {
    try {
      const key = this.keys.get(request.keyId);
      if (!key) {
        throw new MCPError('CRYPTO_ERROR', `Key ${request.keyId} not found`);
      }

      this.checkKeyPermissions(key, requestor, 'decrypt');
      this.validateKeyStatus(key);

      const ciphertext = Buffer.from(request.ciphertext, 'base64');
      let plaintext: Buffer;

      switch (request.algorithm) {
        case 'aes-256-gcm':
          plaintext = this.decryptAESGCM(key.symmetricKey!, ciphertext, request.parameters);
          break;
        case 'aes-256-cbc':
          plaintext = this.decryptAESCBC(key.symmetricKey!, ciphertext, request.parameters);
          break;
        case 'rsa-oaep':
          plaintext = this.decryptRSAOAEP(key.privateKey!, ciphertext);
          break;
        default:
          throw new MCPError('CRYPTO_ERROR', `Unsupported decryption algorithm: ${request.algorithm}`);
      }

      key.metadata.usageCount++;
      key.metadata.lastUsed = new Date();
      await this.saveKeys();

      const decryptionResult: DecryptionResult = {
        plaintext: plaintext.toString('utf8'),
        keyId: request.keyId,
        timestamp: new Date(),
        verified: true
      };

      await this.logOperation({
        type: 'decrypt',
        keyId: request.keyId,
        algorithm: request.algorithm,
        requestor,
        status: 'completed',
        inputSize: ciphertext.length,
        outputSize: plaintext.length
      });

      return decryptionResult;
    } catch (error) {
      await this.logOperation({
        type: 'decrypt',
        keyId: request.keyId,
        algorithm: request.algorithm,
        requestor,
        status: 'failed',
        error: error.message
      });
      throw new MCPError('CRYPTO_ERROR', `Decryption failed: ${error}`);
    }
  }

  async sign(request: SigningRequest, requestor: string): Promise<SigningResult> {
    try {
      const key = this.keys.get(request.keyId);
      if (!key) {
        throw new MCPError('CRYPTO_ERROR', `Key ${request.keyId} not found`);
      }

      this.checkKeyPermissions(key, requestor, 'sign');
      this.validateKeyStatus(key);

      const algorithm = request.algorithm || this.getDefaultSigningAlgorithm(key);
      const data = typeof request.data === 'string' ? 
        Buffer.from(request.data, 'utf8') : request.data;

      let signature: Buffer;

      switch (algorithm) {
        case 'rsa-pss':
          signature = this.signRSAPSS(key.privateKey!, data);
          break;
        case 'rsa-pkcs1':
          signature = this.signRSAPKCS1(key.privateKey!, data);
          break;
        case 'ecdsa':
          signature = this.signECDSA(key.privateKey!, data);
          break;
        case 'ed25519':
          signature = this.signEd25519(key.privateKey!, data);
          break;
        default:
          throw new MCPError('CRYPTO_ERROR', `Unsupported signing algorithm: ${algorithm}`);
      }

      key.metadata.usageCount++;
      key.metadata.lastUsed = new Date();
      await this.saveKeys();

      const signingResult: SigningResult = {
        signature: signature.toString('base64'),
        algorithm,
        keyId: request.keyId,
        timestamp: new Date(),
        format: request.format || 'raw'
      };

      await this.logOperation({
        type: 'sign',
        keyId: request.keyId,
        algorithm,
        requestor,
        status: 'completed',
        inputSize: data.length,
        outputSize: signature.length
      });

      return signingResult;
    } catch (error) {
      await this.logOperation({
        type: 'sign',
        keyId: request.keyId,
        algorithm: request.algorithm || 'unknown',
        requestor,
        status: 'failed',
        error: error.message
      });
      throw new MCPError('CRYPTO_ERROR', `Signing failed: ${error}`);
    }
  }

  async verify(request: VerificationRequest, requestor: string): Promise<VerificationResult> {
    try {
      const key = this.keys.get(request.keyId);
      if (!key) {
        throw new MCPError('CRYPTO_ERROR', `Key ${request.keyId} not found`);
      }

      this.checkKeyPermissions(key, requestor, 'verify');

      const data = typeof request.data === 'string' ? 
        Buffer.from(request.data, 'utf8') : request.data;
      const signature = Buffer.from(request.signature, 'base64');

      let valid: boolean;

      switch (request.algorithm) {
        case 'rsa-pss':
          valid = this.verifyRSAPSS(key.publicKey!, data, signature);
          break;
        case 'rsa-pkcs1':
          valid = this.verifyRSAPKCS1(key.publicKey!, data, signature);
          break;
        case 'ecdsa':
          valid = this.verifyECDSA(key.publicKey!, data, signature);
          break;
        case 'ed25519':
          valid = this.verifyEd25519(key.publicKey!, data, signature);
          break;
        default:
          throw new MCPError('CRYPTO_ERROR', `Unsupported verification algorithm: ${request.algorithm}`);
      }

      const verificationResult: VerificationResult = {
        valid,
        keyId: request.keyId,
        timestamp: new Date(),
        algorithm: request.algorithm
      };

      await this.logOperation({
        type: 'verify',
        keyId: request.keyId,
        algorithm: request.algorithm,
        requestor,
        status: 'completed',
        inputSize: data.length
      });

      return verificationResult;
    } catch (error) {
      await this.logOperation({
        type: 'verify',
        keyId: request.keyId,
        algorithm: request.algorithm,
        requestor,
        status: 'failed',
        error: error.message
      });
      throw new MCPError('CRYPTO_ERROR', `Verification failed: ${error}`);
    }
  }

  async hash(request: HashRequest): Promise<HashResult> {
    try {
      const data = typeof request.data === 'string' ? 
        Buffer.from(request.data, 'utf8') : request.data;

      let hash: Buffer;
      let salt = request.salt;

      if (request.iterations && request.iterations > 1) {
        if (!salt) {
          salt = crypto.randomBytes(32).toString('hex');
        }
        hash = crypto.pbkdf2Sync(data, salt, request.iterations, 64, request.algorithm);
      } else {
        if (salt) {
          const saltBuffer = Buffer.from(salt, 'hex');
          const combined = Buffer.concat([data, saltBuffer]);
          hash = crypto.createHash(request.algorithm).update(combined).digest();
        } else {
          hash = crypto.createHash(request.algorithm).update(data).digest();
        }
      }

      const hashResult: HashResult = {
        hash: hash.toString('hex'),
        algorithm: request.algorithm,
        salt,
        iterations: request.iterations,
        timestamp: new Date()
      };

      await this.logOperation({
        type: 'hash',
        algorithm: request.algorithm,
        requestor: 'anonymous',
        status: 'completed',
        inputSize: data.length,
        outputSize: hash.length
      });

      return hashResult;
    } catch (error) {
      throw new MCPError('CRYPTO_ERROR', `Hashing failed: ${error}`);
    }
  }

  async deriveKey(request: KeyDerivationRequest): Promise<KeyDerivationResult> {
    try {
      const algorithm = request.algorithm || 'pbkdf2';
      const keyLength = request.keyLength || 32;
      const iterations = request.iterations || 100000;
      let salt = request.salt;

      if (!salt) {
        salt = crypto.randomBytes(32).toString('hex');
      }

      let derivedKey: Buffer;

      switch (algorithm) {
        case 'pbkdf2':
          derivedKey = crypto.pbkdf2Sync(
            request.password,
            salt,
            iterations,
            keyLength,
            'sha256'
          );
          break;
        case 'scrypt':
          const scryptParams = request.parameters || { N: 16384, r: 8, p: 1 };
          derivedKey = crypto.scryptSync(
            request.password,
            salt,
            keyLength,
            scryptParams
          );
          break;
        default:
          throw new MCPError('CRYPTO_ERROR', `Unsupported key derivation algorithm: ${algorithm}`);
      }

      const result: KeyDerivationResult = {
        derivedKey: derivedKey.toString('hex'),
        salt,
        iterations,
        algorithm,
        keyLength,
        timestamp: new Date()
      };

      await this.logOperation({
        type: 'derive',
        algorithm,
        requestor: 'anonymous',
        status: 'completed',
        outputSize: keyLength
      });

      return result;
    } catch (error) {
      throw new MCPError('CRYPTO_ERROR', `Key derivation failed: ${error}`);
    }
  }

  async rotateKey(keyId: string, requestor: string): Promise<string> {
    try {
      const key = this.keys.get(keyId);
      if (!key) {
        throw new MCPError('CRYPTO_ERROR', `Key ${keyId} not found`);
      }

      this.checkKeyPermissions(key, requestor, 'rotate');

      const versions = this.keyVersions.get(keyId) || [];
      versions.push({ ...key });

      if (key.rotationPolicy && versions.length > key.rotationPolicy.retainVersions) {
        versions.splice(0, versions.length - key.rotationPolicy.retainVersions);
      }

      const newKeyId = await this.generateKey({
        name: `${key.name} (rotated)`,
        type: key.type,
        algorithm: key.algorithm,
        keySize: key.keySize,
        purpose: key.purpose,
        owner: key.metadata.owner,
        securityLevel: key.securityLevel,
        rotationPolicy: key.rotationPolicy
      });

      key.status = 'inactive';
      this.keyVersions.set(keyId, versions);

      await this.saveKeys();
      await this.saveKeyVersions();

      return newKeyId;
    } catch (error) {
      throw new MCPError('CRYPTO_ERROR', `Key rotation failed: ${error}`);
    }
  }

  async generateCertificate(request: CertificateRequest, requestor: string): Promise<string> {
    try {
      const key = this.keys.get(request.keyId);
      if (!key || key.type !== 'asymmetric') {
        throw new MCPError('CRYPTO_ERROR', 'Invalid key for certificate generation');
      }

      this.checkKeyPermissions(key, requestor, 'sign');

      const certId = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const serialNumber = crypto.randomBytes(16).toString('hex');

      const certificate = this.createX509Certificate({
        ...request,
        serialNumber,
        publicKey: key.publicKey!,
        privateKey: key.privateKey!
      });

      const cert: Certificate = {
        id: certId,
        keyId: request.keyId,
        certificate: certificate.toString('base64'),
        format: 'pem',
        serialNumber,
        subject: request.subject,
        issuer: request.selfSigned ? request.subject : await this.getIssuerSubject(request.issuerCertId),
        validity: request.validity,
        extensions: request.extensions || [],
        fingerprint: this.calculateCertificateFingerprint(certificate),
        status: 'valid',
        created: new Date()
      };

      this.certificates.set(certId, cert);
      await this.saveCertificates();

      return certId;
    } catch (error) {
      throw new MCPError('CRYPTO_ERROR', `Certificate generation failed: ${error}`);
    }
  }

  private validateAlgorithm(algorithm: string): void {
    if (this.config.securityPolicies.forbiddenAlgorithms.includes(algorithm)) {
      throw new MCPError('CRYPTO_ERROR', `Algorithm ${algorithm} is forbidden`);
    }

    if (this.config.securityPolicies.allowedAlgorithms.length > 0 && 
        !this.config.securityPolicies.allowedAlgorithms.includes(algorithm)) {
      throw new MCPError('CRYPTO_ERROR', `Algorithm ${algorithm} is not allowed`);
    }
  }

  private validateKeySize(algorithm: string, keySize?: number): void {
    if (!keySize) return;

    const minSize = this.config.securityPolicies.minimumKeySize[algorithm];
    if (minSize && keySize < minSize) {
      throw new MCPError('CRYPTO_ERROR', `Key size ${keySize} is below minimum ${minSize} for ${algorithm}`);
    }
  }

  private validateKeyStatus(key: CryptographicKey): void {
    if (key.status !== 'active') {
      throw new MCPError('CRYPTO_ERROR', `Key ${key.id} is not active (status: ${key.status})`);
    }

    if (key.metadata.expires && key.metadata.expires < new Date()) {
      throw new MCPError('CRYPTO_ERROR', `Key ${key.id} has expired`);
    }
  }

  private checkKeyPermissions(key: CryptographicKey, requestor: string, operation: KeyOperation): void {
    const hasPermission = key.metadata.permissions.some(permission => 
      permission.principal === requestor && permission.operations.includes(operation)
    );

    if (!hasPermission) {
      throw new MCPError('CRYPTO_ERROR', `Insufficient permissions for operation ${operation} on key ${key.id}`);
    }
  }

  private getDefaultKeySize(algorithm: string): number {
    const sizes: Record<string, number> = {
      'aes-256-gcm': 256,
      'aes-256-cbc': 256,
      'rsa-oaep': 2048,
      'rsa-pss': 2048,
      'ecdsa': 256,
      'ed25519': 256
    };
    return sizes[algorithm] || 256;
  }

  private getDefaultAlgorithm(key: CryptographicKey): string {
    if (key.type === 'symmetric') {
      return this.config.defaultAlgorithms.symmetric;
    }
    return key.algorithm;
  }

  private getDefaultSigningAlgorithm(key: CryptographicKey): string {
    return this.config.defaultAlgorithms.signing;
  }

  private generateSymmetricKey(algorithm: string, keySize: number): string {
    const keyBytes = Math.ceil(keySize / 8);
    return crypto.randomBytes(keyBytes).toString('hex');
  }

  private generateAsymmetricKeyPair(algorithm: string, keySize: number): { publicKey: string; privateKey: string } {
    let keyPair: crypto.KeyPairSyncResult<string, string>;

    switch (algorithm) {
      case 'rsa-oaep':
      case 'rsa-pss':
      case 'rsa-pkcs1':
        keyPair = crypto.generateKeyPairSync('rsa', {
          modulusLength: keySize,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        break;
      case 'ecdsa':
        keyPair = crypto.generateKeyPairSync('ec', {
          namedCurve: 'secp256r1',
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        break;
      case 'ed25519':
        keyPair = crypto.generateKeyPairSync('ed25519', {
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        break;
      default:
        throw new MCPError('CRYPTO_ERROR', `Unsupported asymmetric algorithm: ${algorithm}`);
    }

    return keyPair;
  }

  private encryptAESGCM(key: string, plaintext: Buffer, params: EncryptionParameters): {
    ciphertext: Buffer;
    parameters: EncryptionParameters;
  } {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = params.iv ? Buffer.from(params.iv, 'hex') : crypto.randomBytes(12);
    const cipher = crypto.createCipherGCM('aes-256-gcm');
    
    cipher.setAutoPadding(false);
    cipher.init(keyBuffer, iv);

    if (params.aad) {
      cipher.setAAD(Buffer.from(params.aad, 'utf8'));
    }

    const encrypted = cipher.update(plaintext);
    cipher.final();
    const tag = cipher.getAuthTag();

    const ciphertext = Buffer.concat([encrypted, tag]);

    return {
      ciphertext,
      parameters: {
        ...params,
        iv: iv.toString('hex'),
        tagLength: tag.length
      }
    };
  }

  private decryptAESGCM(key: string, ciphertext: Buffer, params: EncryptionParameters): Buffer {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = Buffer.from(params.iv!, 'hex');
    const tagLength = params.tagLength || 16;
    
    const encrypted = ciphertext.slice(0, -tagLength);
    const tag = ciphertext.slice(-tagLength);

    const decipher = crypto.createDecipherGCM('aes-256-gcm');
    decipher.setAutoPadding(false);
    decipher.init(keyBuffer, iv);
    decipher.setAuthTag(tag);

    if (params.aad) {
      decipher.setAAD(Buffer.from(params.aad, 'utf8'));
    }

    const decrypted = decipher.update(encrypted);
    decipher.final();

    return decrypted;
  }

  private encryptAESCBC(key: string, plaintext: Buffer, params: EncryptionParameters): {
    ciphertext: Buffer;
    parameters: EncryptionParameters;
  } {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = params.iv ? Buffer.from(params.iv, 'hex') : crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', keyBuffer);

    cipher.setAutoPadding(true);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      ciphertext: Buffer.concat([iv, encrypted]),
      parameters: {
        ...params,
        iv: iv.toString('hex')
      }
    };
  }

  private decryptAESCBC(key: string, ciphertext: Buffer, params: EncryptionParameters): Buffer {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = ciphertext.slice(0, 16);
    const encrypted = ciphertext.slice(16);

    const decipher = crypto.createDecipher('aes-256-cbc', keyBuffer);
    decipher.setAutoPadding(true);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private encryptRSAOAEP(publicKey: string, plaintext: Buffer): Buffer {
    return crypto.publicEncrypt({
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    }, plaintext);
  }

  private decryptRSAOAEP(privateKey: string, ciphertext: Buffer): Buffer {
    return crypto.privateDecrypt({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    }, ciphertext);
  }

  private signRSAPSS(privateKey: string, data: Buffer): Buffer {
    return crypto.sign('sha256', data, {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    });
  }

  private verifyRSAPSS(publicKey: string, data: Buffer, signature: Buffer): boolean {
    return crypto.verify('sha256', data, {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, signature);
  }

  private signRSAPKCS1(privateKey: string, data: Buffer): Buffer {
    return crypto.sign('sha256', data, privateKey);
  }

  private verifyRSAPKCS1(publicKey: string, data: Buffer, signature: Buffer): boolean {
    return crypto.verify('sha256', data, publicKey, signature);
  }

  private signECDSA(privateKey: string, data: Buffer): Buffer {
    return crypto.sign('sha256', data, privateKey);
  }

  private verifyECDSA(publicKey: string, data: Buffer, signature: Buffer): boolean {
    return crypto.verify('sha256', data, publicKey, signature);
  }

  private signEd25519(privateKey: string, data: Buffer): Buffer {
    return crypto.sign(null, data, privateKey);
  }

  private verifyEd25519(publicKey: string, data: Buffer, signature: Buffer): boolean {
    return crypto.verify(null, data, publicKey, signature);
  }

  private createX509Certificate(params: any): Buffer {
    return Buffer.from('dummy-certificate', 'utf8');
  }

  private async getIssuerSubject(certId?: string): Promise<CertificateSubject> {
    if (!certId) {
      return { commonName: 'Self-Signed' };
    }

    const cert = this.certificates.get(certId);
    return cert ? cert.subject : { commonName: 'Unknown Issuer' };
  }

  private calculateCertificateFingerprint(certificate: Buffer): string {
    return crypto.createHash('sha256').update(certificate).digest('hex');
  }

  private async logOperation(operation: Omit<CryptoOperation, 'id' | 'timestamp'>): Promise<void> {
    const op: CryptoOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    this.operations.push(op);

    const maxOperations = 10000;
    if (this.operations.length > maxOperations) {
      this.operations.splice(0, this.operations.length - maxOperations);
    }

    await this.saveOperations();
  }

  private async saveKeys(): Promise<void> {
    const data = Array.from(this.keys.values());
    await fs.writeFile(
      path.join(this.configPath, 'keys.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveKeyVersions(): Promise<void> {
    const data = Object.fromEntries(this.keyVersions);
    await fs.writeFile(
      path.join(this.configPath, 'key-versions.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveCertificates(): Promise<void> {
    const data = Array.from(this.certificates.values());
    await fs.writeFile(
      path.join(this.configPath, 'certificates.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveOperations(): Promise<void> {
    await fs.writeFile(
      path.join(this.configPath, 'operations.json'),
      JSON.stringify(this.operations, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalKeys = this.keys.size;
    const activeKeys = Array.from(this.keys.values()).filter(k => k.status === 'active').length;
    const expiredKeys = Array.from(this.keys.values()).filter(k => 
      k.metadata.expires && k.metadata.expires < new Date()
    ).length;
    const totalCertificates = this.certificates.size;

    return {
      status: 'healthy',
      totalKeys,
      activeKeys,
      expiredKeys,
      totalCertificates,
      components: {
        keyManagement: 'healthy',
        encryption: 'healthy',
        signing: 'healthy',
        hashing: 'healthy'
      },
      metrics: {
        operationsToday: this.getOperationsCount('today'),
        encryptionOpsToday: this.getOperationsByType('encrypt', 'today'),
        signingOpsToday: this.getOperationsByType('sign', 'today'),
        hashingOpsToday: this.getOperationsByType('hash', 'today')
      }
    };
  }

  private getOperationsCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return this.operations.filter(op => op.timestamp >= startOfDay).length;
  }

  private getOperationsByType(type: string, period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return this.operations.filter(op => 
      op.type === type && op.timestamp >= startOfDay
    ).length;
  }
}

export class CryptographyServiceMCPServer extends BaseServer {
  private cryptographyService: CryptographyService;

  constructor() {
    super('cryptography-service');
    
    const config: CryptographyConfig = {
      defaultAlgorithms: {
        symmetric: 'aes-256-gcm',
        asymmetric: 'rsa-oaep',
        signing: 'rsa-pss',
        hashing: 'sha256',
        keyDerivation: 'pbkdf2'
      },
      keyManagement: {
        defaultRotationInterval: 7776000000,
        maxKeyAge: 31536000000,
        retainRevokedKeys: true,
        enableKeyVersioning: true
      },
      securityPolicies: {
        minimumKeySize: {
          'aes-256-gcm': 256,
          'aes-256-cbc': 256,
          'rsa-oaep': 2048,
          'rsa-pss': 2048,
          'ecdsa': 256
        },
        allowedAlgorithms: [
          'aes-256-gcm', 'aes-256-cbc', 'rsa-oaep', 'rsa-pss', 
          'ecdsa', 'ed25519', 'sha256', 'sha384', 'sha512'
        ],
        forbiddenAlgorithms: ['md5', 'sha1', 'des', 'rc4'],
        requireHSM: false
      },
      auditConfig: {
        logAllOperations: true,
        logFailuresOnly: false,
        retention: 31536000000
      }
    };

    this.cryptographyService = new CryptographyService(config);
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.cryptographyService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/keys/generate', async (req, res) => {
      try {
        const keyId = await this.cryptographyService.generateKey(req.body);
        res.json({ id: keyId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/encrypt', async (req, res) => {
      try {
        const result = await this.cryptographyService.encrypt(req.body, req.get('X-Requestor') || 'anonymous');
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/decrypt', async (req, res) => {
      try {
        const result = await this.cryptographyService.decrypt(req.body, req.get('X-Requestor') || 'anonymous');
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/sign', async (req, res) => {
      try {
        const result = await this.cryptographyService.sign(req.body, req.get('X-Requestor') || 'anonymous');
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/verify', async (req, res) => {
      try {
        const result = await this.cryptographyService.verify(req.body, req.get('X-Requestor') || 'anonymous');
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/hash', async (req, res) => {
      try {
        const result = await this.cryptographyService.hash(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/derive-key', async (req, res) => {
      try {
        const result = await this.cryptographyService.deriveKey(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/keys/:id/rotate', async (req, res) => {
      try {
        const newKeyId = await this.cryptographyService.rotateKey(req.params.id, req.get('X-Requestor') || 'anonymous');
        res.json({ newKeyId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/certificates/generate', async (req, res) => {
      try {
        const certId = await this.cryptographyService.generateCertificate(req.body, req.get('X-Requestor') || 'anonymous');
        res.json({ id: certId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'generate_cryptographic_key',
        description: 'Generate a new cryptographic key',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['symmetric', 'asymmetric', 'signing', 'key-derivation'] },
            algorithm: { type: 'string' },
            keySize: { type: 'number' },
            purpose: { type: 'array', items: { type: 'string' } },
            owner: { type: 'string' },
            securityLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            rotationPolicy: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['name', 'type', 'algorithm', 'purpose', 'owner']
        }
      },
      {
        name: 'encrypt_data',
        description: 'Encrypt data using a cryptographic key',
        inputSchema: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            plaintext: { type: 'string' },
            algorithm: { type: 'string' },
            parameters: { type: 'object' },
            context: { type: 'object' }
          },
          required: ['keyId', 'plaintext']
        }
      },
      {
        name: 'decrypt_data',
        description: 'Decrypt data using a cryptographic key',
        inputSchema: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            ciphertext: { type: 'string' },
            algorithm: { type: 'string' },
            parameters: { type: 'object' },
            context: { type: 'object' }
          },
          required: ['keyId', 'ciphertext', 'algorithm', 'parameters']
        }
      },
      {
        name: 'sign_data',
        description: 'Sign data using a cryptographic key',
        inputSchema: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            data: { type: 'string' },
            algorithm: { type: 'string' },
            format: { type: 'string', enum: ['raw', 'der', 'pem'] },
            context: { type: 'object' }
          },
          required: ['keyId', 'data']
        }
      },
      {
        name: 'verify_signature',
        description: 'Verify a digital signature',
        inputSchema: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            data: { type: 'string' },
            signature: { type: 'string' },
            algorithm: { type: 'string' },
            format: { type: 'string', enum: ['raw', 'der', 'pem'] },
            context: { type: 'object' }
          },
          required: ['keyId', 'data', 'signature', 'algorithm']
        }
      },
      {
        name: 'hash_data',
        description: 'Hash data using cryptographic hash functions',
        inputSchema: {
          type: 'object',
          properties: {
            data: { type: 'string' },
            algorithm: { type: 'string', enum: ['sha256', 'sha384', 'sha512', 'sha3-256', 'sha3-384', 'sha3-512', 'blake2b', 'blake2s'] },
            salt: { type: 'string' },
            iterations: { type: 'number' }
          },
          required: ['data', 'algorithm']
        }
      },
      {
        name: 'derive_key',
        description: 'Derive a key from a password',
        inputSchema: {
          type: 'object',
          properties: {
            password: { type: 'string' },
            salt: { type: 'string' },
            iterations: { type: 'number' },
            keyLength: { type: 'number' },
            algorithm: { type: 'string', enum: ['pbkdf2', 'scrypt', 'argon2'] },
            parameters: { type: 'object' }
          },
          required: ['password']
        }
      },
      {
        name: 'rotate_key',
        description: 'Rotate a cryptographic key',
        inputSchema: {
          type: 'object',
          properties: {
            keyId: { type: 'string' }
          },
          required: ['keyId']
        }
      },
      {
        name: 'generate_certificate',
        description: 'Generate an X.509 certificate',
        inputSchema: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            subject: { type: 'object' },
            validity: { type: 'object' },
            extensions: { type: 'array' },
            issuerCertId: { type: 'string' },
            selfSigned: { type: 'boolean' }
          },
          required: ['keyId', 'subject', 'validity']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    const requestor = 'mcp-client';

    switch (method) {
      case 'generate_cryptographic_key':
        return { id: await this.cryptographyService.generateKey(params) };

      case 'encrypt_data':
        return await this.cryptographyService.encrypt(params, requestor);

      case 'decrypt_data':
        return await this.cryptographyService.decrypt(params, requestor);

      case 'sign_data':
        return await this.cryptographyService.sign(params, requestor);

      case 'verify_signature':
        return await this.cryptographyService.verify(params, requestor);

      case 'hash_data':
        return await this.cryptographyService.hash(params);

      case 'derive_key':
        return await this.cryptographyService.deriveKey(params);

      case 'rotate_key':
        return { newKeyId: await this.cryptographyService.rotateKey(params.keyId, requestor) };

      case 'generate_certificate':
        return { id: await this.cryptographyService.generateCertificate(params, requestor) };

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}