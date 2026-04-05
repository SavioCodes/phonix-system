# Security Policy

## Supported release line

PHONIX currently treats the following line as the active maintained line:

- `v2.1.x`

Older lines may remain documented in the changelog, but they should be treated as historical unless explicitly re-opened for maintenance.

## Reporting a vulnerability

Please do not disclose exploitable issues publicly before the maintainer has a chance to review them.

Preferred path:

1. Open a private GitHub security report for this repository when that feature is available.
2. If private reporting is not available yet, contact the maintainer through the `SavioCodes` GitHub account and share only the minimum reproduction details needed to start triage.

When reporting, include:

- affected version or commit
- environment details
- steps to reproduce
- expected impact
- whether secrets, tokens, cookies, OAuth state, or guild data may be exposed

## Scope notes

High-priority reports include:

- Discord token exposure
- OAuth session or CSRF bypass in the Admin Center
- privilege escalation in owner/admin flows
- unauthorized access to guild-scoped settings or persisted sessions
- sensitive data leakage through logs, telemetry, or diagnostics

## Response expectations

- `INCERTO`: no formal response SLA has been published yet
- fixes should be documented honestly in `docs/releases/changelog.md`
- manual validation may still be required for Discord, OAuth, and runtime-specific issues before a fix is treated as fully closed
