# Security Architecture — RetailGuard

## 1. Threat Model

### 1.1 Assumptions

- **Dishonest employees** are the primary threat (cashiers, warehouse staff, supervisors)
- Network is unreliable and may be compromised (Cameroon retail environment)
- POS terminals are shared computers in semi-public environments
- Mobile money transactions can be intercepted or replayed
- Physical access to POS terminals is not fully controlled

### 1.2 Threat Actors

| Actor | Access | Motivation | Capabilities |
|-------|--------|------------|-------------|
| Cashier | POS terminal, user account | Theft, unauthorized discounts, sale manipulation | Can create/void sales, record expenses |
| Supervisor | POS + override access | Collusion with cashier, covering theft | Can override prices, approve voids |
| Warehouse staff | Warehouse terminal | Inventory theft, false transfers | Can create movements, transfers |
| Admin | Full system access | Data theft, system abuse | Full CRUD, user management |
| External attacker | Network | Data breach, payment interception | MITM, API attacks, credential stuffing |
| Competitor | Public network | Data theft | API scraping, business intelligence |

### 1.3 Attack Vectors

| Attack Vector | Target | Risk | Mitigation |
|---------------|--------|------|------------|
| Offline sale manipulation | POS terminal | High | Immutable ledger, fraud detection |
| Cash skimming | Cash register | High | Shift reconciliation, discrepancy alerts |
| Fake voids | Sales records | High | Supervisor approval, audit trail |
| Excessive discounts | Pricing | Medium | Min price policy, manager approval |
| Inventory theft | Warehouse | High | Immutable ledger, stock counts, transfer tracking |
| Mobile money fraud | Payments | High | Confirmation webhook, timeout, audit |
| Credential theft | User accounts | Medium | Strong password policy, MFA, lockout |
| Session hijacking | API | High | JWT short expiry, refresh token rotation |
| SQL injection | API | High | Parameterized queries, ORM, input validation |
| XSS | Admin dashboard | Medium | Content-Security-Policy, output encoding |
| CSRF | API | Medium | SameSite cookies, CSRF tokens |
| MITM | Network | High | TLS 1.3, certificate pinning |
| Replay attack | API | High | Idempotency keys, timestamps |
| Data at rest | POS terminal | High | SQLite encryption, OS keychain |

## 2. Authentication & Authorization

### 2.1 JWT Implementation

```typescript
// Access Token (RS256 signed)
const ACCESS_TOKEN_CONFIG = {
  algorithm: 'RS256' as const,       // Asymmetric — allows public key verification
  privateKey: process.env.JWT_PRIVATE_KEY,  // 4096-bit RSA
  publicKey: process.env.JWT_PUBLIC_KEY,
  expiresIn: '15m',
  issuer: 'retailguard-api',
  audience: 'retailguard-pos'
};

// Offline Token (Ed25519 signed)
const OFFLINE_TOKEN_CONFIG = {
  algorithm: 'EdDSA' as const,        // Small key size, fast verification
  privateKey: devicePrivateKey,       // Per-device key
  publicKey: devicePublicKey,
  expiresIn: '2h',
  issuer: 'retailguard-pos',
  audience: 'retailguard-api'
};
```

**Key management:**
- Server RSA keys rotated every 90 days
- Previous keys kept for 24 hours for token validation overlap
- Device Ed25519 keys generated on first login, stored in OS keychain
- Keys never transmitted over network (except public key during device trust)

### 2.2 Password Hashing

```typescript
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### 2.3 RBAC Enforcement

**NestJS Guard implementation:**

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions) {
      return true; // No permissions required
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredPermissions.every(permission =>
      user.permissions.includes(permission)
    );
  }
}

// Usage in controller:
@Post('sales')
@RequirePermissions('sales.create')
async createSale(@Body() dto: CreateSaleDto) {
  // ...
}
```

### 2.4 Tenant Isolation

```typescript
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];
    const userTenantId = request.user.tenant_id;

    if (!tenantId || tenantId !== userTenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    // Set tenant context for database queries
    request.tenantId = tenantId;
    return true;
  }
}
```

## 3. API Security

### 3.1 Rate Limiting

```typescript
import { ThrottlerModule } from '@nestjs/throttler';

ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 1000,          // 1 second
    limit: 10,          // 10 requests per second
  },
  {
    name: 'medium',
    ttl: 60000,         // 1 minute
    limit: 100,         // 100 requests per minute
  },
  {
    name: 'long',
    ttl: 3600000,       // 1 hour
    limit: 1000,        // 1000 requests per hour
  },
]);
```

### 3.2 Input Validation

```typescript
import { z } from 'zod';  // Runtime validation with Zod

const CreateSaleSchema = z.object({
  branch_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    unit: z.enum(['BOX', 'SQM', 'PIECE', 'KG', 'BAG']),
    quantity: z.number().positive(),
    unit_price: z.number().positive(),
    line_discount: z.number().min(0).default(0),
  })).min(1).max(100),
  payments: z.array(z.object({
    payment_type: z.enum(['cash', 'mtn_momo', 'orange_money', 'card', 'bank_transfer', 'credit']),
    amount: z.number().positive(),
    momo_phone: z.string().optional(),
  })).min(1),
  discount_amount: z.number().min(0).default(0),
  discount_reason: z.string().max(500).optional(),
});

// NestJS pipe uses Zod schema
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: z.ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: result.error.issues
      });
    }
    return result.data;
  }
}
```

### 3.3 SQL Injection Prevention

- **All database queries use TypeORM or parameterized queries** — never raw string concatenation
- Raw SQL (if needed) uses `queryRunner.query(sql, params)` with parameterized values
- Input values are validated and sanitized via Zod schemas before reaching the database layer
- Database user has minimal privileges (no DDL, only CRUD on specific tables)

### 3.4 XSS Prevention

- **React** automatically escapes output in JSX (no `dangerouslySetInnerHTML` without explicit review)
- **Content-Security-Policy** header configured to restrict script sources
- Admin dashboard uses strict CSP:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.retailguard.com; font-src 'self'; form-action 'self'; frame-ancestors 'none';
  ```
- All user-generated content (product names, notes) is rendered as text, not HTML

### 3.5 CSRF Prevention

- API uses `Authorization: Bearer <token>` header (not cookies for auth)
- No session cookies used for authentication
- If cookies are needed for admin dashboard, use `SameSite=Strict` and CSRF token header
- CORS configured to allow only known origins:
  ```typescript
  app.enableCors({
    origin: ['https://admin.retailguard.com', 'https://*.retailguard.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-ID', 'X-Branch-ID', 'X-Device-ID', 'X-Idempotency-Key'],
    credentials: true,
    maxAge: 3600
  });
  ```

## 4. Device Security

### 4.1 POS Terminal Security

- **OS-level:** Windows 10/11 with locked-down user accounts (no admin access)
- **App-level:** Electron app runs in a sandboxed process
- **Storage:** SQLite database file encrypted with AES-256-GCM (key derived from device secret + user password)
- **Keychain:** Ed25519 keys stored in OS keychain (Windows Credential Manager)
- **Screen lock:** Auto-lock after 5 minutes of inactivity
- **Printer/Scanner:** USB devices verified by vendor ID/product ID

### 4.2 SQLite Encryption

```typescript
import { SQLiteCipher } from './sqlite-cipher';

// AES-256-GCM encryption of SQLite file
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'pbkdf2',         // Key derived from device secret + user password
  iterations: 600000,              // OWASP recommended PBKDF2 iterations
  saltSize: 32,
  ivSize: 12,
  tagSize: 16,                     // GCM authentication tag
};

// Key derivation
function deriveEncryptionKey(deviceSecret: string, userPassword: string): Buffer {
  const combined = deviceSecret + userPassword;
  return crypto.pbkdf2Sync(combined, salt, 600000, 32, 'sha512');
}
```

## 5. Network Security

### 5.1 TLS Configuration

```typescript
const TLS_CONFIG = {
  minVersion: 'TLSv1.3' as const,
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
  ],
  honorCipherOrder: true,
  // Certificate pinning (SHA-256 of public key)
  certificatePins: [
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  ],
};
```

### 5.2 API Request Validation

Every API request is validated for:
1. **JWT signature** — RS256 or Ed25519 (offline token)
2. **Token expiry** — Not expired
3. **Tenant ID** — Matches token's tenant_id
4. **Branch ID** — User has access to this branch
5. **Rate limit** — Not exceeded
6. **Idempotency key** — Not replayed (for mutation endpoints)
7. **Request body** — Validated against Zod schema
8. **Content-Type** — Must be `application/json`
9. **Content-Length** — Max 1MB per request

## 6. Audit Logging

### 6.1 What Gets Logged

Every security-relevant action is logged to `audit_logs`:

```typescript
const AUDIT_EVENTS = {
  // Authentication
  'user.login': 'User logged in',
  'user.login.failed': 'Failed login attempt',
  'user.logout': 'User logged out',
  'user.password.change': 'Password changed',
  'user.password.reset': 'Password reset by admin',
  'user.locked': 'Account locked due to failed attempts',
  'user.unlocked': 'Account unlocked by admin',

  // Authorization
  'device.trusted': 'Device registered as trusted',
  'device.trust.revoked': 'Device trust revoked',
  'permission.denied': 'Access denied to resource',

  // Sales
  'sale.created': 'Sale created',
  'sale.voided': 'Sale voided',
  'sale.refunded': 'Sale refunded',
  'sale.price.override': 'Price override applied',
  'sale.discount.excessive': 'Excessive discount applied',

  // Inventory
  'inventory.movement.created': 'Inventory movement created',
  'inventory.correction': 'Inventory correction applied',
  'inventory.transfer.created': 'Transfer created',
  'inventory.transfer.approved': 'Transfer approved',
  'inventory.transfer.received': 'Transfer received',

  // Admin
  'user.created': 'User created',
  'user.deactivated': 'User deactivated',
  'user.role.changed': 'User role changed',
  'product.created': 'Product created',
  'product.price.changed': 'Product price changed',
  'branch.config.changed': 'Branch configuration changed',

  // Fraud
  'fraud.alert.created': 'Fraud alert generated',
  'fraud.alert.resolved': 'Fraud alert resolved',
  'fraud.alert.false_positive': 'Fraud alert marked false positive',

  // Sync
  'sync.started': 'Sync started',
  'sync.completed': 'Sync completed',
  'sync.failed': 'Sync failed',
  'sync.conflict.detected': 'Sync conflict detected',
  'sync.conflict.resolved': 'Sync conflict resolved',
};
```

### 6.2 Audit Log Integrity

- Audit logs are append-only (no UPDATE, no DELETE)
- Audit logs are shipped to a separate log aggregation service (e.g., Loki/ELK)
- Audit logs are immutable at the database level (separate schema, restricted permissions)
- Critical events (login, password change, void, price override) are also logged to a separate secure log file

## 7. Session Management Security

### 7.1 Token Rotation

```typescript
// Refresh token rotation:
// Every time a refresh token is used, it is revoked and a new one issued
// This prevents refresh token replay attacks

async function rotateRefreshToken(
  oldTokenHash: string,
  userId: string,
  deviceId: string
): Promise<{ newToken: string; newTokenHash: string; expiresAt: Date }> {
  // Revoke old token
  await redis.del(`refresh_token:${oldTokenHash}`);

  // Generate new token
  const newToken = crypto.randomBytes(64).toString('hex');
  const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');

  // Store new token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await redis.set(
    `refresh_token:${newTokenHash}`,
    JSON.stringify({ userId, deviceId, expiresAt }),
    'EX',
    30 * 24 * 60 * 60 // 30 days
  );

  return { newToken, newTokenHash, expiresAt };
}
```

### 7.2 Session Revocation

```typescript
async function revokeUserSessions(
  userId: string,
  excludeDeviceId?: string
): Promise<void> {
  // Find all sessions for this user
  const sessions = await redis.keys(`session:${userId}:*`);

  for (const sessionKey of sessions) {
    const session = JSON.parse(await redis.get(sessionKey));

    // Skip if excluding this device
    if (excludeDeviceId && session.deviceId === excludeDeviceId) continue;

    // Revoke refresh token
    await redis.del(`refresh_token:${session.refreshTokenHash}`);

    // Remove session
    await redis.del(sessionKey);
  }
}
```

## 8. Security Headers

```typescript
// All API responses include these security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
```

## 9. Offline Security Considerations

### 9.1 Offline Data at Rest

- SQLite database file is encrypted with AES-256-GCM
- Encryption key is derived from device secret + user password (not stored on disk)
- User password is never stored in plaintext — only the bcrypt hash is stored
- Offline token is encrypted in SQLite
- Device private key is stored in OS keychain (platform-secure storage)

### 9.2 Offline Token Security

- Offline token is signed with device's Ed25519 private key
- Server verifies the signature using the device's public key (stored during device trust)
- Offline token expires after 2 hours
- If device is stolen, the offline token expires and cannot be renewed
- Admin can revoke device trust remotely (next time device syncs)

### 9.3 Offline Sync Security

- All sync data is transmitted over TLS (HTTPS)
- Idempotency keys prevent replay attacks
- Batch checksums detect data corruption
- Server validates all data before accepting sync (even if signed by trusted device)
- Fraud detection runs on all offline transactions when they sync