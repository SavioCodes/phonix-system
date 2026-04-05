import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { type CommandDefinition } from './framework.js';
import { presentDoctorResult } from './presenters.js';

const doctorCommand: CommandDefinition<Record<string, never>> = {
  name: 'doctor',
  description: 'Executa um diagnostico operacional completo com foco em playback, sessao, dashboard e proximos passos',
  aliases: ['diagnostico'],
  data: new SlashCommandBuilder()
    .setName('doctor')
    .setDescription('Checa runtime, FFmpeg, session health, recovery, dashboard, telemetria e proximos passos desta guild')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentDoctorResult(
      await context.services.useCases.admin.doctor({
        client: context.client,
        guild: context.guild,
        member: context.member,
        userId: context.user.id,
        textChannelId: context.metadata.textChannelId,
      }),
    );
  },
};

export const doctorCommands = [doctorCommand] as const;
