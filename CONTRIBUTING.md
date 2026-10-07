# Contributing

## Setup

```bash
pnpm install
pnpm check   # typecheck, tests, Go tests, package-boundary check
```

Packages live in `packages/` and may import only `@rosetta/contracts` and outside libraries (`app` is the one exception). `pnpm check:boundaries` enforces this.

## Versioning and releases

Every package is versioned independently with semantic versioning, using [Changesets](https://github.com/changesets/changesets).

1. **Change a package?** Run `pnpm changeset`, pick the packages you touched and the bump (patch, minor, major), and describe the change. Commit the generated file in `.changeset/` with your PR. CI fails PRs that change a package without a changeset. For a change that needs no release (docs, CI), run `pnpm changeset --empty`.
2. **Merge to `main`.** The Release workflow opens or updates a **"Version packages"** PR that bumps versions and writes each package's `CHANGELOG.md`.
3. **Merge the "Version packages" PR.** The workflow runs `scripts/release.mjs`, which tags every Go module from its `package.json` version and pushes the tags. npm publishing is not enabled yet.

### Go modules

`parser` (and `contracts`, which is also a Go module) has a `package.json` so Changesets can version it. Go requires monorepo submodules to be tagged with their directory path, so the tags are `packages/parser/vX.Y.Z` and `packages/contracts/vX.Y.Z`.

Preview the tags without creating them:

```bash
node scripts/release.mjs --dry-run
```
