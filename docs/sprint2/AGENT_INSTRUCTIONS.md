# Sprint 2 — Instructions for all coding agents

> **Before making any changes, read this file and `docs/sprint2/progress.json`.** The JSON tracker is the team's running execution state. This document is the operating procedure. GitHub Issues/Project and the codebase remain the authority for actual work; the tracker is a synchronized index, **not** a substitute for code, tests, or GitHub evidence.

## Mission and grading target

ITSC 3155 Implementation Sprint 2 (100 pts): use GitHub Copilot **Agent Mode** and **Figma MCP** to review the design; review/generate the ORM (or Firestore typed models), class and sequence PlantUML diagrams; configure local and team database access; deliver at least one real persistent user story; protect secrets; test and lint; show all five individual contributions; maintain GitHub Scrum evidence; release the tested commit as `v0.2.0-sprint2`. Submit repo and release URLs. Full criteria, point weights, source pages, paths, and acceptance tests are in the tracker.

**Repository:** https://github.com/sai2005-1/AI-AssistedPlanningApp

**Observed baseline:** `main` at `8dd2e0f298b35932caa0c5f97cb3e83c0c5bb782`, inspected November 15, 2026. **This is a snapshot, not a live status feed.** At each session, check the current HEAD and update observations if it changed.

## Session startup (mandatory)

1. Read `AGENTS.md` (platform-specific constraints), `docs/sprint2/AGENT_INSTRUCTIONS.md`, `docs/sprint2/progress.json`, relevant GitHub Issue, and relevant source files. Check the **current** Git branch/HEAD and staged changes.
2. Identify your assigned `T##` task, status, dependencies, owner, files, and definition of done in `progress.json`. Check whether another teammate owns the same file. **Do not improvise a new task or mutate unassigned areas.**
3. Confirm the GitHub Issue, acceptance criteria, and Figma MCP frame that correspond to your task. Figma MCP must be connected when reviewing design.
4. If database architecture `D01` has not received team approval, **do not rewrite or migrate databases**. Inspect the Firestore integration already present for Issue #4, document tradeoffs, and seek owner approval before further storage changes.
5. State in the PR or session note: task ID, Issue link, exact proposed files, what is already implemented, acceptance checks, tests, risks, and any blocker. Get a teammate's review for architecture or destructive changes.

## Project-specific architecture warning

The existing code is **not frontend-only**. It has Next.js + Payload CMS collections (`Users`, `Tasks`, `CalendarEvents`, `Courses`), authentication, `.ics` parsing, and server actions that call `payload.create/find/update`. `src/payload.config.ts` uses **Figma-managed** `buildFigmaConfig()`; the root `AGENTS.md` forbids direct database adapter/migration changes *while inside that managed environment*. The current commit **already implements a scoped hybrid**: Payload persists existing users/tasks/calendar, while server-only Firebase Admin SDK/Firestore handles team projects for GitHub Issue #4. The team has not documented approval or demonstrated working local database connectivity. Preserve the division of data ownership; do not add another datastore for the same records or replace auth without approval. The Figma-managed Payload environment still requires a reproducible local run review.

## Work session protocol

- Create a **feature branch**, keep changes small, reviewable, and matched to one or two linked Issues. Open a PR rather than pushing to `main` directly.
- Prefer existing code and the smallest correction. Keep user-visible behavior working. A generated function is not automatically correct: review assumptions, constraints, auth, input validation, and failures.
- For new persisted data, use the approved data-access layer; no hardcoded arrays, mock APIs, local state, or test-only fixtures as a substitute for real persistence.
- Make and run applicable tests. Log actual commands, results, timestamp, and a commit/PR link. Use a local/test database rather than the shared dev database for destructive tests.
- Never commit `.env`, passwords, tokens, keys, real student/customer information, private URLs or auth headers. Review `git diff --cached`; if a secret was ever committed, rotate it and address Git history.
- Keep direct source edits distinct from generated document updates; if you only wrote a plan or status update, **don't** claim the code is implemented or the rubric item earned.

## How to update `progress.json`

Update this tracker in the **same PR** as the task when possible:

1. Update **only your own `tasks[]` object** (`status`, `implementation_notes`, `evidence`, `last_updated_on`) and, when necessary, relevant `decisions`, `required_artifacts`, `evidence_register` and `rubric[]` status. Never delete other owners' entries.
2. Use only these statuses: `not_started`, `partial`, `in_progress`, `blocked`, `verified`, `not_applicable`.
3. For `in_progress`, add the actual branch/PR link to evidence or notes. For `blocked`, record the specific missing decision, owner, and blocker.
4. Mark `verified` **only when every `definition_of_done` check has been met** and `evidence` is nonempty with actual test/run/PR/commit paths or links. A source file existing is **partial**, not verified. Never fabricate a test, approval, screenshot, commit, or release.
5. Update a rubric item to `verified` **only when all mapped mandatory tasks and its rubric acceptance checks are satisfied**, supported by `rubric[].evidence`; `points_awarded` remains `null` because the instructor grades it.
6. Update `last_updated_on` and append a factual `change_log[]` entry with date, agent/teammate, changes, and evidence. Update `repo.audited_head_sha` only after actually re-auditing that HEAD; do not silently reset it to your local branch SHA.
7. Run `node scripts/validate-sprint2-progress.mjs` and fix errors. Commit tracker updates with your implementation or submit a separate progress PR.

## Definition of complete

A Sprint 2 requirement is not complete because Copilot generated code or the UI looked functional. It must have **reproducible proof**: correct models/diagrams, approved local database setup, validated read/write, restart persistence, useful errors, per-member connectivity, test pass logs, lint output, meaningful commits from all five identities, tracked Issues/Project, and release notes pointing to the exact tested commit.

## Agent kickoff prompt (paste into VS Code Copilot Agent Mode)

```text
You are helping the ITSC 3155 team deliver Sprint 2.
First read AGENTS.md, docs/sprint2/AGENT_INSTRUCTIONS.md, docs/sprint2/progress.json,
and the current GitHub Issue. Verify current HEAD. Use the Figma MCP design.

My assigned task: T__ (fill this in before running).
Work only on the assigned task and agreed file ownership. Summarize:
(1) what code already exists, (2) what the rubric requires,
(3) the smallest implementation plan, (4) dependencies/risks,
(5) exact tests/evidence needed, and (6) any blockers.

Review the existing Payload + Firestore architecture first. If D01 is not approved,
do NOT rewrite or migrate it. Do not create overlapping data ownership or
replace Payload authentication without explicit team approval.
Never assume generated code is validated. Keep secrets out of Git.
After implementing and testing, propose updates to the tracker with factual
commit/PR/test evidence; do not mark any item verified without proof.
Stop before destructive operations or changes to another owner's files.
```

## One person, one meaningful contribution

The tracker lists **proposed** ownership only. All five members must approve/claim work and commit meaningful Sprint 2 contributions from their own GitHub identity. Documentation can support a contribution, but empty commits, unrelated formatting, or unreviewed generated files may not satisfy the assignment. Demo responsibility alone is not sufficient proof of a meaningful Git commit.

## Recommended review order

1. Approve `D01` Payload/Firestore domain boundary and `D04` ownership; verify Copilot/Figma MCP.
2. Review the already committed Issue #4 Firestore implementation and PlantUML diagrams; verify actual Figma design correspondence and ownership rules.
3. Prove a local development path (including Figma-managed Payload constraints), local Firestore emulator and shared dev DB, and test `.env.example` + `.gitignore` handling.
4. Complete and demonstrate Issue #4 Team Deliverables (implemented in source) **through real Firestore persistence**; verify restart, owner/member authorization and full acceptance criteria.
5. Add automated successful Firestore operations and negative-access tests (current Vitest tests cover the 72-hour deadline rule only), configure lint, capture evidence, confirm every member has a meaningful commit, and only then cut the release.
## Re-audit notes (2026-11-15)

Main commit `8dd2e0f` introduced the Team Deliverables interface, `src/app/(frontend)/team-actions.ts`, `src/lib/team-deliverables.ts`, `src/lib/team-types.ts`, Firebase Admin initialization, `.env.example`, `docs/firestore-setup.md`, class/sequence PlantUML and rendered SVGs, and `src/lib/team-deliverable-rules.test.ts`. **These files exist, but no runtime, emulator, local developer database, restart persistence, successful test execution, or acceptance sign-off is independently confirmed.** Never reimplement these from scratch just because the previous sprint notes are older. The current graded-feature candidate is GitHub [Issue #4](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/4), not an automatically approved final selection.

**Safeguard:** Firestore service-account credentials are server-side secrets. Do not put real keys into `.env.example`, tracker, GitHub, screenshots, tool output or Copilot chat. Server Admin SDK bypasses Firestore Rules, so authorization must be enforced by server actions/repository functions and verified by tests. For the rubric's rules/index requirement, record an explicit reviewed rationale for any server-only exception rather than claiming a rules file exists when it does not.
