import { describe, expect, it, vi } from 'vitest';
import { ownerCommands } from '../../src/modules/commands/ownerCommands.js';

const ownerCommand = ownerCommands[0];

describe('owner command', () => {
  it('uses admin visibility by default in slash while keeping runtime owner checks', () => {
    const slashData = ownerCommand.data.toJSON();

    expect(slashData.default_member_permissions).toBe('8');
    expect(slashData.dm_permission).toBe(false);
  });

  it('parses owner subcommands for prefix aliases', () => {
    expect(ownerCommand.parsePrefix(['status'])).toEqual({ subcommand: 'status' });
    expect(ownerCommand.parsePrefix(['official'])).toEqual({ subcommand: 'official-guild' });
    expect(ownerCommand.parsePrefix(['falhas'])).toEqual({ subcommand: 'incidents' });
  });

  it('keeps the owner namespace explicit and owner-only', async () => {
    await expect(
      ownerCommand.execute(
        {
          user: { id: 'user-1' },
        } as never,
        { subcommand: 'status' },
      ),
    ).rejects.toThrow('Apenas o owner global do PHONIX pode usar o comando owner.');
  });

  it('delegates status to the owner use case with the requester id', async () => {
    const status = vi.fn().mockResolvedValue({
      kind: 'notice',
      variant: 'info',
      title: 'PHONIX | Owner status',
      description: 'ok',
    });

    const payload = await ownerCommand.execute(
      {
        user: { id: '976586934455513159' },
        client: { id: 'client-1' },
        services: {
          useCases: {
            owner: {
              status,
            },
          },
        },
      } as never,
      { subcommand: 'status' },
    );

    expect(status).toHaveBeenCalledWith({
      client: { id: 'client-1' },
      requesterId: '976586934455513159',
    });
    expect(payload?.embeds?.[0]?.data.title).toBe('PHONIX | Owner status');
  });
});
