# PHONIX Release Policy

## Versioning model

PHONIX follows Semantic Versioning:

- `MAJOR`: breaking public behavior or architecture-level contract changes
- `MINOR`: meaningful feature releases such as `Admin Center`, `Owner Control` or `Smart Session`
- `PATCH`: stability, UX or correctness improvements that do not redefine the product surface

## Current public release line

- `v2.1.0 - Smart Session`

## Tagging strategy

- Git tags should use the canonical version name: `v2.1.0`
- Release titles should use: `v<semver> - <release name>`
- Examples:
  - `v2.1.0 - Smart Session`
  - `v2.2.0 - Playback Intelligence`
  - `v2.3.0 - Multi-Source Engine`

## Named release roadmap

These names are planning anchors for the public repository and not promises of completed implementation:

- `v2.1.0 - Smart Session`: current public line
- `v2.2.0 - Playback Intelligence`: `NAO IMPLEMENTADO AINDA`
- `v2.3.0 - Multi-Source Engine`: `NAO IMPLEMENTADO AINDA`

## Release gates

Every release candidate should pass:

```bash
npm run typecheck
npm run build
npm test
npm run test:smoke
```

Use the dedicated verification scripts when the release touches those surfaces:

- `npm run verify:playback`
- `npm run verify:dashboard`

## Manual validation policy

Automated validation is necessary but not sufficient for:

- Discord playback UX
- Smart Session recovery after restart
- Admin Center OAuth in a real Discord environment
- owner DM delivery and `/owner` behavior in production-like conditions

These checks should remain explicitly marked as `PARCIAL` until the manual round is completed.

## Documentation rules

Every release should keep these files aligned:

- `README.md`
- `docs/architecture/system-architecture.md`
- `docs/releases/project-tracker.md`
- `docs/releases/changelog.md`

Update operational runbooks whenever behavior changes in:

- playback pipeline
- recovery / session health
- owner control
- Admin Center authentication or authorization
