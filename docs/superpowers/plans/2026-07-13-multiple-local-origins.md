# Multiple Local Origins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow API mutations from the explicitly configured localhost origins on ports 5173, 5174, and 5175.

**Architecture:** Parse a comma-separated `APP_ORIGINS` environment value into a validated `string[]`. `OriginGuard` checks exact membership in that array; configuration examples and runbooks use the same variable name.

**Tech Stack:** NestJS, TypeScript, Zod, Jest, Supertest

## Global Constraints

- Allow only explicitly listed origins; do not add wildcards or infer port ranges.
- Require every production origin to use HTTPS.
- Keep `127.0.0.1` disallowed unless explicitly configured.

---

### Task 1: Parse and validate multiple origins

**Files:**
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/test/setup-env.ts`

**Interfaces:**
- Consumes: raw `APP_ORIGINS: string`
- Produces: `Env.APP_ORIGINS: string[]`

- [ ] Add tests proving comma-separated values become a trimmed URL array and production rejects any HTTP member.
- [ ] Run `npm run test --workspace apps/api -- --runInBand src/config/env.schema.spec.ts` and confirm the new assertions fail because `APP_ORIGINS` is not parsed.
- [ ] Replace `APP_ORIGIN` with a split/trim/filter transformation piped into `z.array(z.url()).min(1)` and validate every production member starts with `https://`.
- [ ] Run the focused test again and confirm it passes.

### Task 2: Enforce exact membership in OriginGuard

**Files:**
- Modify: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/src/auth/origin.guard.ts`

**Interfaces:**
- Consumes: `Env.APP_ORIGINS: string[]` and request `Origin` header
- Produces: `true` for exact members; existing `INVALID_ORIGIN` error otherwise

- [ ] Add an authentication E2E assertion that `http://localhost:5175` reaches the Google authentication flow successfully.
- [ ] Run `npm run test:e2e --workspace apps/api -- --runInBand test/auth.e2e-spec.ts` and confirm it fails with `INVALID_ORIGIN`.
- [ ] Change the guard from equality against one string to `allowedOrigins.includes(request.header('origin') ?? '')`.
- [ ] Run the focused E2E test and confirm both allowed and attacker-origin cases pass.

### Task 3: Update runtime configuration and documentation

**Files:**
- Modify: `.env` (ignored local file)
- Modify: `.env.example`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/gcp-deployment.md`

**Interfaces:**
- Produces: consistent `APP_ORIGINS` examples for local and production environments

- [ ] Set local `.env` and `.env.example` to `APP_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175`.
- [ ] Rename deployment examples to `APP_ORIGINS`; production continues to contain one HTTPS origin.
- [ ] Run `rg -n "APP_ORIGIN\\b" . --glob '!node_modules/**' --glob '!docs/superpowers/plans/2026-07-13-overtime-tracker.md' --glob '!docs/superpowers/specs/**'` and confirm no active configuration reference remains.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`; confirm all commands exit successfully.
- [ ] Commit the implementation with `git commit -m "fix: allow multiple configured origins"`.
