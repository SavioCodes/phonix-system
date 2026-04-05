import { URLSearchParams } from 'node:url';
import type { AppConfig, ResolvedDashboardConfig } from '../../../core/config/env.js';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

export interface DiscordOAuthToken {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresIn: number;
}

export interface DiscordOAuthUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface DiscordOAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
}

export interface DiscordOAuthClient {
  exchangeCode(code: string): Promise<DiscordOAuthToken>;
  refreshAccessToken(refreshToken: string): Promise<DiscordOAuthToken>;
  fetchUser(accessToken: string): Promise<DiscordOAuthUser>;
  fetchGuilds(accessToken: string): Promise<DiscordOAuthGuild[]>;
}

export class DiscordApiOAuthClient implements DiscordOAuthClient {
  public constructor(
    private readonly config: AppConfig,
    private readonly dashboard: ResolvedDashboardConfig,
  ) {}

  public async exchangeCode(code: string): Promise<DiscordOAuthToken> {
    return this.exchangeToken(
      new URLSearchParams({
        client_id: this.config.discordClientId,
        client_secret: this.dashboard.discordClientSecret ?? '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${this.dashboard.baseUrl}/dashboard/callback`,
      }),
    );
  }

  public async refreshAccessToken(refreshToken: string): Promise<DiscordOAuthToken> {
    return this.exchangeToken(
      new URLSearchParams({
        client_id: this.config.discordClientId,
        client_secret: this.dashboard.discordClientSecret ?? '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
  }

  private async exchangeToken(body: URLSearchParams): Promise<DiscordOAuthToken> {
    const response = await fetch(`${DISCORD_API_BASE_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Discord OAuth token exchange falhou com status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      scope: string;
      expires_in: number;
    };

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      tokenType: payload.token_type,
      scope: payload.scope,
      expiresIn: payload.expires_in,
    };
  }

  public async fetchUser(accessToken: string): Promise<DiscordOAuthUser> {
    const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Discord OAuth user fetch falhou com status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    return {
      id: payload.id,
      username: payload.username,
      globalName: payload.global_name ?? null,
      avatar: payload.avatar ?? null,
    };
  }

  public async fetchGuilds(accessToken: string): Promise<DiscordOAuthGuild[]> {
    const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me/guilds`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Discord OAuth guild fetch falhou com status ${response.status}.`);
    }

    const payload = (await response.json()) as Array<{
      id: string;
      name: string;
      icon?: string | null;
      permissions?: string;
      permissions_new?: string;
    }>;

    return payload.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
      permissions: guild.permissions_new ?? guild.permissions ?? '0',
    }));
  }
}
