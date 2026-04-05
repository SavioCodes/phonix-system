# PHONIX Repository Profile

## Recommended GitHub repository name

- `phonix-system`

## Why this name

- `PHONIX` remains the product and runtime brand.
- `system` matches the actual scope better than `bot` alone because the repository now contains the Discord runtime, Smart Session logic, owner control, operational verification flows and the opt-in Admin Center.
- The npm package can continue as `phonix-bot` without forcing repository naming to mirror the package name.

## Recommended GitHub description

- `Production Discord music bot with guild session recovery, diagnostics, owner control, and an opt-in Admin Center.`

## Recommended GitHub topics

- `discord-bot`
- `music-bot`
- `typescript`
- `nodejs`
- `discordjs`
- `discord-player`
- `fastify`
- `prisma`
- `sqlite`
- `observability`
- `oauth2`
- `recovery`
- `vitest`

## Public repository posture

- Keep `package.json` as `private: true` to prevent accidental npm publishing.
- Treat `README.md` as the product entry point and `docs/README.md` as the documentation map.
- Keep release notes and roadmap under `docs/releases/`.
- Keep operational runbooks under `docs/verification/` and `docs/operations/`.
- Keep `SECURITY.md` at the repository root and prefer repo-native docs over wiki pages.
- Keep `.editorconfig` and `.gitignore` aligned with the real cross-platform workflow of the project.

## Metadata aligned in this repository

- `package.json` description, repository, homepage and bugs URL now target the recommended GitHub repository.
- `.github/CODEOWNERS` points to `@SavioCodes`.
- `.github/` now contains CI, issue templates and a PR template.
