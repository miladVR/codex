# Instructions for coding agents in miladVR/codex

This is a **two-product repository**. Never assume the whole repository is one application.

## Read first
- `.specify/memory/constitution.md` — binding engineering and delivery rules once approved.
- `imidro-fire-scoreboard/README.md` and `imidro-fire-scoreboard/docs/ARCHITECTURE-FA.md` when working on IMIDRO Fire Scoreboard.
- `cloze-studio/README.md` and `cloze-studio/README.fa.md` when working on Cloze Studio.
- `docs/SPEC-KIT-CODEX-FA.md` — how this project uses official Spec Kit with Codex.

## Execution contract
1. Identify the affected product, exact request, acceptance criteria, out-of-scope areas, and regression risks. Ask only for genuinely blocking information.
2. For significant changes, follow the official Spec Kit SDD artifacts and Codex skills: `$speckit-specify` → `$speckit-plan` → `$speckit-tasks` → `$speckit-implement` → `$speckit-converge`. Use `$speckit-clarify` and `$speckit-analyze` when needed. Follow the currently active feature in `.specify/feature.json`, not merely a Git branch.
3. Work in a reviewable feature branch; minimize unrelated code changes. Never change release files, deploy, tag, or merge to main without explicit user approval.
4. Test and independently review before describing any implementation as complete. Follow a plan → implement → verify → independent-review cycle; do not claim the ECC framework itself is installed or that any test ran unless it did.
5. Report: what changed, affected files, tests actually run, tests not run, user-data/backward-compatibility impact, and remaining risks.

## Product commands
- IMIDRO: `cd imidro-fire-scoreboard && npm ci && npm test`; optional supported GUI validation: `npm run test:smoke` (requires Electron/display), plus manual Windows installer and second-screen checks.
- Cloze Studio: `cd cloze-studio && npm test && npm run check` (Node.js 20+). Its committed `dist/` is part of the delivered application.

## Non-negotiable safeguards
- Preserve competition records, scoring rules, confirmation gates, backups, and safe reset procedures.
- Preserve offline use, Persian RTL UI, keyboard accessibility, and print compatibility.
- Never commit secrets, personal data, or actual competition exports.
- Never pretend generated code, CI, installers, or UI workflows were verified if they were not.
