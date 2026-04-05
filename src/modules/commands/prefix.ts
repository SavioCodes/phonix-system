export function extractCommandBody(content: string, configuredPrefix: string, botId: string): string | null {
  const trimmed = content.trim();
  const mentionPrefixes = [`<@${botId}>`, `<@!${botId}>`];

  for (const prefix of mentionPrefixes) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }

  if (trimmed.startsWith(configuredPrefix)) {
    return trimmed.slice(configuredPrefix.length).trim();
  }

  return null;
}

export function tokenizeCommandInput(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|([^\s]+)/gu;

  for (const match of input.matchAll(pattern)) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
    tokens.push(token.replaceAll(/\\(["'`\\])/gu, '$1'));
  }

  return tokens;
}
