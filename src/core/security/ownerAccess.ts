import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export const PHONIX_OWNER_USER_ID = '976586934455513159' as const;
export const PHONIX_OFFICIAL_GUILD_ID = '1489363867023835310' as const;

export function isOwnerUserId(userId: string | null | undefined) {
  return userId === PHONIX_OWNER_USER_ID;
}

export function isOfficialGuildId(guildId: string | null | undefined) {
  return guildId === PHONIX_OFFICIAL_GUILD_ID;
}

export function hasAdministrativeControl(input: {
  userId?: string | null;
  member?: Pick<GuildMember, 'permissions'> | null;
}) {
  if (isOwnerUserId(input.userId)) {
    return true;
  }

  return Boolean(input.member?.permissions.has(PermissionFlagsBits.Administrator));
}
