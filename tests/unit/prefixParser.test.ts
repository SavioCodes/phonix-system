import { describe, expect, it } from 'vitest';
import { extractCommandBody, tokenizeCommandInput } from '../../src/modules/commands/prefix.js';

describe('prefix parser', () => {
  it('extracts configured prefix commands', () => {
    expect(extractCommandBody('!play neon blade', '!', '123')).toBe('play neon blade');
  });

  it('extracts mention prefix commands', () => {
    expect(extractCommandBody('<@123> play neon blade', '!', '123')).toBe('play neon blade');
    expect(extractCommandBody('<@!123> play neon blade', '!', '123')).toBe('play neon blade');
  });

  it('tokenizes quoted playlist names', () => {
    expect(tokenizeCommandInput('playlist add "mix phonk" neon blade')).toEqual([
      'playlist',
      'add',
      'mix phonk',
      'neon',
      'blade',
    ]);
  });
});
