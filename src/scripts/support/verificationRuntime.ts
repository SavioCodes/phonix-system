import { execSync } from 'node:child_process';

const STANDARD_VERIFICATION_COMMANDS = [
  'npm run typecheck',
  'npm run build',
  'npm test',
  'npm run test:smoke',
] as const;

export function runVerificationStep(command: string) {
  console.log(`> ${command}`);
  execSync(command, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.env.ComSpec ?? 'cmd.exe',
  });
}

export function runStandardVerificationSuite() {
  for (const command of STANDARD_VERIFICATION_COMMANDS) {
    runVerificationStep(command);
  }
}
