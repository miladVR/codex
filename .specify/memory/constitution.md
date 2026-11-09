# miladVR / codex — Engineering Constitution

**Status:** Proposed in the Spec Kit adoption pull request; effective only after review and merge  
**Version:** 1.0.0 (proposal) | **Drafted:** 2026-11-07

## Core Principles

### I. Specification before implementation
Every material behavior change begins with a focused spec under `specs/` describing the affected project, user problem, in-scope and out-of-scope behavior, testable acceptance criteria, and edge cases. A bug fix must also reproduce the failure and document the verified fix. Avoid retroactively inventing specifications for historical behavior.

### II. Preserve user data and existing contracts
Do not silently alter scoring formulas, rank/tie-breaking rules, validation, backups, migrations, deletion safeguards, or publication semantics. For any data-model change, include backward-compatibility and restore tests; preserve existing user data unless an explicitly approved migration says otherwise. Never imply testing or deployment succeeded without evidence.

### III. Test and verify in layers
For `imidro-fire-scoreboard/`, run `npm test` (Node.js 22+); when the runtime allows, also run `npm run test:smoke` using Electron and verify Windows installation separately. For `cloze-studio/`, run `npm test` and `npm run check` (Node.js 20+). Write regression tests for bug fixes and record manual checks needed for printing, fullscreen/second-screen behavior, accessibility, and offline execution.

### IV. Treat projects as separate products
This repository contains two products. Work only within the project named in the active spec unless shared configuration changes are justified and reviewed. Keep each product's version, documentation, license, build workflow, and release decisions independent. Never use a global dependency upgrade as a substitute for a bounded change.

### V. Offline-first, Persian-friendly, accessible UX
IMIDRO Fire Scoreboard must remain usable offline on Windows, including installation, competition operation, scoring, backups, and presentation display. Cloze Studio must retain offline browser use and bilingual Persian/English behavior. Preserve RTL layout, readable Persian typography, keyboard access, print layouts, clear error messages, and existing user preferences. Avoid unnecessary dependencies and telemetry.

### VI. Secure, reproducible, least-privilege changes
Do not commit passwords, tokens, participant records, or real competition data. Validate inputs crossing process boundaries (including Electron IPC), minimize filesystem privileges, and avoid unreviewed remote code execution. Pin important tooling for reproducibility, use official sources, and review license/security implications of added dependencies.

### VII. Independent review and human-controlled delivery
Apply the disciplined cycle: scope → specify → plan → implement → independent review → test → verify → report. Record known limitations, test evidence, and unresolved risks. Do not merge to `main`, tag a release, publish installers, rewrite history, delete user data, or make external operational changes without explicit authorization. Use reviewable branches and pull requests for repository changes.

## Project-specific guardrails

**IMIDRO Fire Scoreboard (`imidro-fire-scoreboard/`):** Electron/CommonJS, local persisted competition state, judges' confirmation workflow, multi-discipline scoring, manual/automatic order, display on a second screen, PDF reporting, and safe backup/restore. Preserve public/live versus formally confirmed results and explicit destructive-action confirmations. Refer to `docs/ARCHITECTURE-FA.md`, `docs/LIVE-DISPLAY-VERIFICATION-FA.md`, versioned release notes, and data schemas before changing these areas.

**Cloze Studio (`cloze-studio/`):** static HTML/CSS/JavaScript worksheet generator with five question types, bilingual UI, branding, answer keys, and A4/A5/Letter/Legal output. Protect print and offline behavior, and keep the committed distribution files internally consistent.

## Workflow and quality gates

1. Select exactly one affected product and read its README, tests, and relevant design documentation.
2. Use Codex Spec Kit skills: `$speckit-specify`, `$speckit-clarify` as needed, `$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement`, and `$speckit-converge`. Review artifacts between steps.
3. Before implementation, explicitly document acceptance criteria, compatibility impact, expected tests, and rollback approach.
4. Avoid unrelated refactors. Require targeted regression tests and the project's existing automated checks. Where UI or Windows-only tests cannot run, document the unverified checks, not an invented pass.
5. Present a concise change summary, tests actually executed, compatibility risks, and any required human approval in the pull request.

## Governance

These principles govern future SDD work without rewriting the existing application. Any exception must be documented in the relevant specification and reviewed before implementation. Amendments require a dedicated pull request explaining the reason, compatibility effects, and version change. This constitution becomes effective only when the adoption pull request is approved and merged.
