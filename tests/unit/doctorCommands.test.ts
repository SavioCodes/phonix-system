import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { doctorCommands } from '../../src/modules/commands/doctorCommands.js';
import { createCommandContext } from '../support/commandContext.js';

const doctorCommand = doctorCommands[0];

describe('doctor command', () => {
  it('keeps only the explicit diagnostico alias and drops the vague health alias', () => {
    expect(doctorCommand.aliases).toEqual(['diagnostico']);
  });

  it('keeps administrative slash visibility in the published command data', () => {
    const data = doctorCommand.data.toJSON();
    expect(data.default_member_permissions).toBe(String(PermissionFlagsBits.Administrator));
  });

  it('delegates doctor execution to the admin use case with guild runtime context', async () => {
    const doctor = vi.fn().mockResolvedValue({
      appVersion: '2.3.0',
      overallStatus: 'ok',
      summary: { ok: 1, warning: 0, error: 0 },
      slashScope: 'global',
      dashboard: {
        requestedEnabled: false,
        effectiveEnabled: false,
        port: 3000,
        baseUrl: null,
        disableReason: null,
      },
      checks: [],
      nextActions: [],
    });

    const payload = await doctorCommand.execute(
      createCommandContext({
        client: { id: 'client-1' },
        guild: { id: 'guild-1' },
        member: { id: 'member-1' },
        user: { id: 'user-1' },
        metadata: { textChannelId: 'text-1' },
        services: {
          useCases: {
            admin: {
              doctor,
            },
          },
        },
      }),
      {} as never,
    );

    expect(doctor).toHaveBeenCalledWith({
      client: { id: 'client-1' },
      guild: { id: 'guild-1' },
      member: { id: 'member-1' },
      userId: 'user-1',
      textChannelId: 'text-1',
    });
    expect(payload?.flags).toBe(MessageFlags.IsComponentsV2);
    const rendered = payload?.components?.[0];
    expect(rendered && 'toJSON' in rendered ? rendered.toJSON() : rendered).toMatchObject({
      components: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('PHONIX | Diagnostico do sistema'),
        }),
      ]),
    });
  });
});
