# Contributing to PHONIX

PHONIX is maintained as a production-oriented Discord music bot and Admin Center. Changes should improve the real product, stay honest about limitations, and keep code, docs and operational runbooks aligned.

## Ground rules

- Do not introduce fake features or speculative documentation.
- Keep changes consistent with the current architecture in `src/app`, `src/core` and `src/modules`.
- Update impacted documentation when runtime behavior, operational workflows or public commands change.
- Treat `README.md`, `docs/architecture/system-architecture.md`, `docs/releases/project-tracker.md` and `docs/releases/changelog.md` as part of the deliverable.
- Treat repository hygiene as part of the deliverable too: when the bot changes meaningfully, sync the docs and the GitHub repository state before considering the work finished.

## Development workflow

1. Install dependencies: `npm install`
2. Generate Prisma Client: `npm run prisma:generate`
3. Fill `.env` from `.env.example`
4. Run the bot locally with `npm run dev` or `npm run start`

## Required validation

Run the full quality baseline before opening a pull request:

```bash
npm run typecheck
npm run build
npm test
npm run test:smoke
```

When you touch verification flows, prefer the dedicated scripts as well:

```bash
npm run verify:playback
npm run verify:dashboard
```

## Definition of done

Changes are only considered complete when all of the following are true:

- code is updated
- impacted docs are updated
- release-facing files stay aligned
- the repository state is synchronized when the change is intended to ship publicly

## Documentation map

- Docs index: [docs/README.md](docs/README.md)
- Architecture: [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md)
- Release tracker: [docs/releases/project-tracker.md](docs/releases/project-tracker.md)
- Changelog: [docs/releases/changelog.md](docs/releases/changelog.md)
- Release policy: [docs/governance/release-policy.md](docs/governance/release-policy.md)
