import type { APIEmbed, JSONEncodable } from 'discord.js';

type JsonEncodableLike<T> = JSONEncodable<T> | { toJSON(): T };

export function renderDiscordValue<T>(value: T | JsonEncodableLike<T> | null | undefined): T | null | undefined {
  if (!value) {
    return value;
  }

  if (typeof value === 'object' && 'toJSON' in value) {
    return value.toJSON();
  }

  return value;
}

export function renderEmbed(
  embed: APIEmbed | JsonEncodableLike<APIEmbed> | null | undefined,
): APIEmbed | null | undefined {
  return renderDiscordValue(embed);
}
