# Contributing to HelixID Console

HelixID Console is the operator UI for the HelixID trust stack — a React SPA
that reads and acts on agent identity, credential, and revocation state
through the HelixID API.

It is a client for the API, not a source of truth. The HelixID database
remains authoritative for every trust decision; the Console only presents it
and calls documented endpoints.

> **New to HelixID?** Read
> [docs.helixid.dev](https://docs.helixid.dev) first — it covers the concepts
> (DIDs, verifiable credentials, the two-issuer model, delegation, revocation)
> that the rest of this document assumes. This file is the authoritative
> process for *this* repository; the docs site is the orientation.

---

## Open-Source Scope

This repository is Apache-2.0 and public. It ships as a static SPA served by
nginx, published to Docker Hub as
[`helixid/console`](https://hub.docker.com/r/helixid/console).

Nothing is baked in at build time — `API_BASE_URL`, `ADMIN_API_KEY`, and the
operator credentials are injected at runtime, so the same image works in every
environment. Please keep it that way: a change that requires a rebuild per
environment will be sent back.

---

## Ways to Contribute

1. **Accessibility** — keyboard navigation, focus handling, and screen-reader
   labelling, particularly on the audit and agent tables.
2. **Audit and agent views** — making credential state easier to read at a glance.
3. **Bug reports** with a screenshot and the browser you saw it in.

---

## Before You Start

**Open a Discussion or Issue first** for any non-trivial change. Trivial means: typos, obviously incorrect code, a missing test for existing behavior, a small doc improvement. Anything else — new features, new dependencies, API changes, performance optimizations that change behavior, new packages — needs a design sketch and sign-off from a maintainer before a PR lands.

This saves time on both sides. A rejected PR after two weeks of work is a worse outcome than a fifteen-minute design conversation.

---

## Development Setup

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0` — note 20.0–20.18 will **not** work
- pnpm ≥ 9 (`corepack enable`)
- Git
- A running HelixID API to point at — the quickest is one of the
  [example stacks](https://github.com/helixid/helixid/tree/main/examples)

### Clone and Bootstrap

```bash
git clone https://github.com/helixid/helix-console.git
cd helix-console
pnpm install
cp .env.example .env      # point API_BASE_URL at your API
pnpm dev                  # vite dev server
```

The dev server proxies API calls, so `API_BASE_URL` can be a bare origin here.
In the built image there is no proxy — see §3 of the README.

### Run Tests

```bash
pnpm test           # vitest, with coverage
pnpm test:non-live  # without coverage — fastest inner loop
pnpm test:watch
pnpm typecheck
pnpm build          # tsc --noEmit && vite build
```

---

## Repository Structure

```
helix-console/
├── src/         # the SPA
├── public/      # static assets
├── brand-src/   # brand source assets
├── docker/      # nginx config and entrypoint for the published image
└── tests/
```

The rest of the system lives in separate repositories — see
[Project Structure](https://docs.helixid.dev/get-started/project-structure).

---

## Branching and Commits

### Branch Names

```
<type>/<short-kebab-description>

feat/did-web-resolver
fix/statuslist-cache-invalidation
docs/delegation-tutorial
```

### Conventional Commits (required)

We use [Conventional Commits](https://www.conventionalcommits.org/). The release tooling parses commit messages to generate changelogs and bump versions.

```
<type>(<scope>): <summary>

[optional body]

[optional footer(s)]
```

Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.

Scope is the package or area: `core`, `api`, `sdk-js`, `mcp`, `langchain`, `cli`, `docs`.

Examples:

```
feat(sdk): add did:web resolver with HTTPS pinning

fix(api): invalidate status-list cache after credential revocation

perf(sdk): avoid re-parsing JWS on repeated verification

BREAKING CHANGE: verifyPresentation now returns DelegationChain,
not string[]. Migration: use result.delegationChain.dids.
```

**Breaking changes** must include a `BREAKING CHANGE:` footer and a migration note in the PR description.

### Sign Your Commits (DCO)

Every commit must be signed off under the [Developer Certificate of Origin](https://developercertificate.org/). We deliberately use DCO instead of a CLA — it's a lightweight attestation with no corporate-legal review tax. By signing off, you affirm that you have the right to submit the work under Apache 2.0.

```bash
git commit -s -m "feat(sdk): add did:web resolver"
```

This appends a `Signed-off-by: Your Name <your.email@example.com>` line. Our CI rejects PRs missing DCO on any commit. If you forget, rebase with `git rebase --signoff`.

---

## Pull Requests

### Before Opening a PR

- [ ] Rebase on the latest `main`
- [ ] Run `pnpm typecheck && pnpm test && pnpm build` locally and pass
- [ ] Add or update tests — no untested code merges
- [ ] Update docs if you changed public API
- [ ] Include a screenshot for any visual change
- [ ] Every commit is DCO-signed

### PR Description

Use this template — it mirrors what reviewers and release notes need:

```markdown
## What
<short summary of the change>

## Why
<motivation, linked issue, relevant context>

## How
<implementation approach, trade-offs considered, alternatives rejected>

## Testing
<how you verified this works — unit, integration, manual scenarios>

## Risk & Rollback
<what could break, how to revert if this ships bad>

## Breaking Changes
<none | description + migration path>

Closes #<issue>
```

### Review Expectations

- Two maintainer approvals required for changes in `helix-core` or `helix-sdk-js`
- One maintainer approval for everything else
- Reviewers respond within 3 business days — if silent longer, ping in Discussions
- We squash-merge by default; commit history on `main` is one commit per PR

### Merging

Only maintainers merge. Do not merge your own PR even if you have permissions.

---

## Coding Standards

### TypeScript and React

- `strict` mode. No `any` in component props or exported signatures.
- Keep runtime configuration runtime — never read build-time constants for
  anything environment-specific.

### Security-Sensitive Code

The Console holds an operator session and can revoke credentials, so:

- **The admin API key must never reach the browser bundle.** If a change makes it
  reachable from client code, that is a security bug regardless of intent.
- Everything rendered from a credential — DIDs, subjects, scopes, audit payloads —
  originates from agents, not operators. Treat it as untrusted and escape it.
- Privileged actions (revoke, enroll) need the same authorization check on the API
  side; do not rely on hiding a button.

### Testing

- Tests live in `tests/`.
- A bug fix should come with the test that would have caught it.

---

## Security Disclosure

**Do not open public issues for security vulnerabilities.** Use one of:

- Email `hello@dgverse.in`
- [GitHub Security Advisory](https://github.com/helixid/helix-console/security/advisories/new) (private)

We acknowledge within 48 hours, triage within 7 business days, and practice coordinated disclosure with a default 90-day embargo. Full scope, safe-harbor terms, and response policy: [`SECURITY.md`](SECURITY.md).

---

## Release Process

The Console is published as a **multi-arch container image** rather than an npm
package. Every push to `main` publishes `helixid/console:latest` plus a
`:<git-sha>` tag, from `.github/workflows/docker-build.yml`.

```bash
docker pull helixid/console:latest
```

Pin the sha tag for a reproducible deploy. The HelixID example stacks consume this
image directly — they do **not** build the Console from source — so a change
merged here reaches every demo on their next `docker compose up --build`.

---

## Community and Code of Conduct

- **Discussions:** [github.com/helixid/helixid/discussions](https://github.com/helixid/helixid/discussions) — design questions, use cases, show-and-tell
- **Issues:** [github.com/helixid/helixid/issues](https://github.com/helixid/helixid/issues) — bugs and concrete feature requests
- **Security:** `hello@dgverse.in`
- **General contact:** `hello@dgverse.in`

We follow the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Short version: be respectful, assume good faith, keep technical debate on technical merits, and escalate conduct concerns to `hello@dgverse.in`.

---

## Licensing of Contributions

Contributions are licensed under [Apache License 2.0](LICENSE), same as the project. DCO sign-off on each commit is the full legal attestation — no CLA, no separate agreement, no surprise relicensing. See the DCO section above.

---

## Quick Reference

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Test | `pnpm test` |
| Test (fast loop) | `pnpm test:non-live` |
| Typecheck | `pnpm typecheck` |
