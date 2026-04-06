import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { DashboardSessionRecord } from '../contracts.js';

export const DASHBOARD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_SESSION_ENCRYPTION_SALT = 'phonix-dashboard-oauth';

interface DashboardSessionModel {
  id: string;
  discordUserId: string;
  username: string;
  avatar: string | null;
  authorizedGuildIdsJson: string;
  csrfTokenHash: string;
  oauthAccessTokenCiphertext: string | null;
  oauthRefreshTokenCiphertext: string | null;
  oauthTokenType: string | null;
  oauthScope: string | null;
  oauthExpiresAt: Date | null;
  lastAuthorizedSyncAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface DashboardSessionCreateData {
  id: string;
  discordUserId: string;
  username: string;
  avatar: string | null;
  authorizedGuildIdsJson: string;
  csrfTokenHash: string;
  oauthAccessTokenCiphertext: string | null;
  oauthRefreshTokenCiphertext: string | null;
  oauthTokenType: string;
  oauthScope: string;
  oauthExpiresAt: Date;
  lastAuthorizedSyncAt: Date;
  expiresAt: Date;
}

interface DashboardSessionUpdateData {
  username?: string;
  avatar?: string | null;
  authorizedGuildIdsJson?: string;
  oauthAccessTokenCiphertext?: string | null;
  oauthRefreshTokenCiphertext?: string | null;
  oauthTokenType?: string;
  oauthScope?: string;
  oauthExpiresAt?: Date;
  lastAuthorizedSyncAt?: Date | null;
  expiresAt?: Date;
}

interface DashboardSessionDelegate {
  create(args: { data: DashboardSessionCreateData }): Promise<DashboardSessionModel>;
  findUnique(args: { where: { id: string } }): Promise<DashboardSessionModel | null>;
  update(args: { where: { id: string }; data: DashboardSessionUpdateData }): Promise<DashboardSessionModel>;
  deleteMany(args: { where: { id?: string; expiresAt?: { lte: Date } } }): Promise<unknown>;
}

interface DashboardSessionPrisma {
  dashboardSession: DashboardSessionDelegate;
}

export interface DashboardSessionOAuthTokenSet {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresAt: Date;
}

interface CreateDashboardSessionInput {
  discordUserId: string;
  username: string;
  avatar?: string | null;
  authorizedGuildIds: string[];
  csrfToken: string;
  oauth: DashboardSessionOAuthTokenSet;
  lastAuthorizedSyncAt?: Date;
  expiresAt?: Date;
}

interface UpdateDashboardSessionInput {
  username?: string;
  avatar?: string | null;
  authorizedGuildIds?: string[];
  oauth?: DashboardSessionOAuthTokenSet;
  lastAuthorizedSyncAt?: Date | null;
  expiresAt?: Date;
}

export class DashboardSessionsService {
  private readonly encryptionKey: Buffer;

  public constructor(
    private readonly prisma: DashboardSessionPrisma,
    private readonly sessionSecret: string,
  ) {
    this.encryptionKey = scryptSync(sessionSecret, DASHBOARD_SESSION_ENCRYPTION_SALT, 32);
  }

  public static generateToken() {
    return randomBytes(32).toString('hex');
  }

  public async create(input: CreateDashboardSessionInput): Promise<DashboardSessionRecord> {
    await this.pruneExpired();

    const session = await this.prisma.dashboardSession.create({
      data: {
        id: randomUUID(),
        discordUserId: input.discordUserId,
        username: input.username,
        avatar: input.avatar ?? null,
        authorizedGuildIdsJson: JSON.stringify([...new Set(input.authorizedGuildIds)].sort()),
        csrfTokenHash: hashToken(input.csrfToken, this.sessionSecret),
        oauthAccessTokenCiphertext: encryptSecret(input.oauth.accessToken, this.encryptionKey),
        oauthRefreshTokenCiphertext: encryptSecret(input.oauth.refreshToken, this.encryptionKey),
        oauthTokenType: input.oauth.tokenType,
        oauthScope: input.oauth.scope,
        oauthExpiresAt: input.oauth.expiresAt,
        lastAuthorizedSyncAt: input.lastAuthorizedSyncAt ?? new Date(),
        expiresAt: input.expiresAt ?? new Date(Date.now() + DASHBOARD_SESSION_TTL_MS),
      },
    });

    return mapDashboardSession(session, this.encryptionKey);
  }

  public async get(sessionId: string): Promise<DashboardSessionRecord | null> {
    const session = await this.prisma.dashboardSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.delete(session.id);
      return null;
    }

    try {
      return mapDashboardSession(session, this.encryptionKey);
    } catch {
      await this.delete(session.id);
      return null;
    }
  }

  public async update(sessionId: string, input: UpdateDashboardSessionInput): Promise<DashboardSessionRecord | null> {
    const existing = await this.prisma.dashboardSession.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      return null;
    }

    const session = await this.prisma.dashboardSession.update({
      where: { id: sessionId },
      data: {
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        ...(input.authorizedGuildIds !== undefined
          ? { authorizedGuildIdsJson: JSON.stringify([...new Set(input.authorizedGuildIds)].sort()) }
          : {}),
        ...(input.oauth
          ? {
              oauthAccessTokenCiphertext: encryptSecret(input.oauth.accessToken, this.encryptionKey),
              oauthRefreshTokenCiphertext: encryptSecret(input.oauth.refreshToken, this.encryptionKey),
              oauthTokenType: input.oauth.tokenType,
              oauthScope: input.oauth.scope,
              oauthExpiresAt: input.oauth.expiresAt,
            }
          : {}),
        ...(input.lastAuthorizedSyncAt !== undefined ? { lastAuthorizedSyncAt: input.lastAuthorizedSyncAt } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
    });

    return mapDashboardSession(session, this.encryptionKey);
  }

  public async delete(sessionId: string) {
    await this.prisma.dashboardSession.deleteMany({
      where: { id: sessionId },
    });
  }

  public async verifyCsrf(sessionId: string, csrfToken: string) {
    const session = await this.get(sessionId);
    if (!session) {
      return false;
    }

    const expected = Buffer.from(session.csrfTokenHash, 'hex');
    const actual = Buffer.from(hashToken(csrfToken, this.sessionSecret), 'hex');

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  public async pruneExpired() {
    await this.prisma.dashboardSession.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }
}

function mapDashboardSession(session: DashboardSessionModel, encryptionKey: Buffer): DashboardSessionRecord {
  return {
    id: session.id,
    discordUserId: session.discordUserId,
    username: session.username,
    avatar: session.avatar ?? null,
    authorizedGuildIds: parseGuildIds(session.authorizedGuildIdsJson),
    csrfTokenHash: session.csrfTokenHash,
    oauthAccessToken: decryptSecret(session.oauthAccessTokenCiphertext, encryptionKey),
    oauthRefreshToken: decryptSecret(session.oauthRefreshTokenCiphertext, encryptionKey),
    oauthTokenType: session.oauthTokenType ?? null,
    oauthScope: session.oauthScope ?? null,
    oauthExpiresAt: session.oauthExpiresAt ?? null,
    lastAuthorizedSyncAt: session.lastAuthorizedSyncAt ?? null,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function parseGuildIds(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === 'string');
}

function hashToken(token: string, secret: string) {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function encryptSecret(value: string | null, key: Buffer) {
  if (!value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptSecret(payload: string | null, key: Buffer) {
  if (!payload) {
    return null;
  }

  const [ivHex, tagHex, encryptedHex] = payload.split('.');
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error('Dashboard session secret payload is malformed.');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
