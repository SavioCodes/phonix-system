import type { GuildSettings } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export class GuildSettingsService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOrCreate(guildId: string): Promise<GuildSettings> {
    return this.prisma.guildSettings.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });
  }

  public async getPrefix(guildId: string): Promise<string> {
    const settings = await this.getOrCreate(guildId);
    return settings.prefix;
  }

  public async getSettings(guildId: string): Promise<GuildSettings> {
    return this.getOrCreate(guildId);
  }

  public async getDefaultVolume(guildId: string): Promise<number> {
    const settings = await this.getOrCreate(guildId);
    return settings.defaultVolume;
  }

  public async isAutoplayEnabled(guildId: string): Promise<boolean> {
    const settings = await this.getOrCreate(guildId);
    return settings.autoplayEnabled;
  }

  public async isResumeQueueEnabled(guildId: string): Promise<boolean> {
    const settings = await this.getOrCreate(guildId);
    return settings.resumeQueueEnabled;
  }

  public async setAutoplay(guildId: string, enabled: boolean): Promise<GuildSettings> {
    return this.prisma.guildSettings.upsert({
      where: { guildId },
      update: { autoplayEnabled: enabled },
      create: {
        guildId,
        autoplayEnabled: enabled,
      },
    });
  }

  public async setPrefix(guildId: string, prefix: string): Promise<GuildSettings> {
    validatePrefix(prefix);

    return this.prisma.guildSettings.upsert({
      where: { guildId },
      update: { prefix },
      create: {
        guildId,
        prefix,
      },
    });
  }

  public async setDefaultVolume(guildId: string, defaultVolume: number): Promise<GuildSettings> {
    validateDefaultVolume(defaultVolume);

    return this.prisma.guildSettings.upsert({
      where: { guildId },
      update: { defaultVolume },
      create: {
        guildId,
        defaultVolume,
      },
    });
  }

  public async setResumeQueue(guildId: string, enabled: boolean): Promise<GuildSettings> {
    return this.prisma.guildSettings.upsert({
      where: { guildId },
      update: { resumeQueueEnabled: enabled },
      create: {
        guildId,
        resumeQueueEnabled: enabled,
      },
    });
  }
}

function validatePrefix(prefix: string) {
  if (!prefix.trim()) {
    throw new Error('O prefixo nao pode ficar vazio.');
  }

  if (prefix.trim() !== prefix) {
    throw new Error('O prefixo nao pode comecar ou terminar com espacos.');
  }

  if (/\s/iu.test(prefix)) {
    throw new Error('O prefixo nao pode conter espacos.');
  }

  if (prefix.length > 5) {
    throw new Error('O prefixo deve ter no maximo 5 caracteres.');
  }
}

function validateDefaultVolume(defaultVolume: number) {
  if (!Number.isInteger(defaultVolume) || defaultVolume < 0 || defaultVolume > 150) {
    throw new Error('O volume padrao deve ficar entre 0 e 150.');
  }
}
