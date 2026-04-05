import { describe, expect, it } from 'vitest';
import { commandDefinitions, getSlashCommandData } from '../../src/modules/commands/registry.js';

describe('command registry', () => {
  it('contains the main PHONIX commands', () => {
    expect(commandDefinitions.some((command) => command.name === 'play')).toBe(true);
    expect(commandDefinitions.some((command) => command.name === 'favorite')).toBe(true);
    expect(commandDefinitions.some((command) => command.name === 'playlist')).toBe(true);
    expect(commandDefinitions.some((command) => command.name === 'config')).toBe(true);
    expect(commandDefinitions.some((command) => command.name === 'doctor')).toBe(true);
    expect(commandDefinitions.some((command) => command.name === 'owner')).toBe(true);
  });

  it('exports slash command data', () => {
    const slash = getSlashCommandData();
    expect(slash.length).toBe(commandDefinitions.length);
  });

  it('keeps a stable slash command catalog without duplicate root names', () => {
    const slash = getSlashCommandData();
    const names = slash.map((command) => command.name);

    expect(names).toHaveLength(20);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'play',
      'pause',
      'resume',
      'skip',
      'stop',
      'queue',
      'nowplaying',
      'volume',
      'loop',
      'shuffle',
      'remove',
      'clear',
      'recover',
      'favorite',
      'playlist',
      'config',
      'doctor',
      'history',
      'help',
      'owner',
    ]);
  });
});
