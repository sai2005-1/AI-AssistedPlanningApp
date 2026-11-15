# Sprint 2 AI design review — draft awaiting human review

Date: November 15, 2026. Tasks: T05, T06, T07, T29.
Baseline: `8dd2e0f298b35932caa0c5f97cb3e83c0c5bb782` on `main`.
Documentation branch: `docs/sprint2-uml-design-review`.

## Status and provenance

This draft records an assistant's source comparison and proposed documentation
corrections. **Human review and approval have not occurred.** Julian authorized
investigation, not approval of these findings. No task is claimed verified.

The candidate assumption is that every app user must have a collaborator-directory
document. The existing UML contains that assumption. **Its AI-generation
provenance is unconfirmed.** Both diagrams first appear in Sai's commit
`8dd2e0f`, but the Git history inspected does not identify their generating tool,
original prompt, or human reviewer. The task context describes an AI-generated design, but that is
not independent provenance evidence. Attach the actual generation
record or author confirmation below before claiming the rubric's human-reviewed
AI correction is satisfied. Do not attribute the assumption to Sai personally.

## Primary correction: directory membership is optional

Original UML:

```plantuml
User "1" <-- "1" TeamUserDirectory : userId reference
```

This says each user has exactly one directory document. The source permits an
app account to exist before any Firestore directory document is created:

1. [`createAppAuth().signup`](../src/lib/app-auth.ts) creates a Payload user and
   logs in; it contains no Firestore directory write. The
   [`Users` collection](../src/collections/Users.ts) has no directory-creation hook.
2. [`directoryReference`](../src/lib/team-deliverables.ts) selects
   `teamUserDirectory/{encodeURIComponent(userId)}`, giving a deterministic
   document key for a user.
3. In that repository, `loadTeamWorkspace` upserts the signed-in user's entry;
   `searchDirectory` upserts only after its normalized query length reaches two;
   `createTeamProject` also upserts the profile in its creation batch.
4. `searchDirectory` queries Firestore directory fields, not all Payload users.
   `addProjectMember` reports that no matching teammate is in the directory when
   its username query is empty.

Proposed corrected UML:

```plantuml
User "1" <-- "0..1" TeamUserDirectory : userId reference
```

Each directory entry references one user ID; a user can have zero or one entry.
This describes the application's current write paths, not a foreign-key or
cascade guarantee across databases. No runtime experiment was performed.

Rationale: avoid claiming signup synchronizes both stores or that every existing
account is immediately selectable as a collaborator. Preserve the current lazy
creation behavior; do not change authentication or the repository to fit the old
diagram. A note now lists all three entry-creation paths.

## Additional confirmed documentation corrections

| Original statement | Source evidence | Proposed correction |
| --- | --- | --- |
| Task/event ownership is always mandatory | `Tasks.ts` and `CalendarEvents.ts`: `owner` has no `required: true`; `assignOwner` assigns app-user creates and otherwise preserves the supplied/original owner. `app-access.ts` permits CMS-admin creates. | Show `owner: User?` and `0..1` at the User end; explain that normal app-user creation assigns an owner. This does not relax access rules. |
| Firestore project/deliverable descriptions are optional stored fields | `team-actions.ts` defaults omitted descriptions to `""`; repository writes include `description`, and `projectFromData`/`deliverableFromData` use `requiredString`; `team-types.ts` requires strings. | Show `description: string [may be empty]` for those two entities. Calendar-event description remains optional. |
| UI calls `createDeliverable`, and reload passes the whole user object to the repository | `submitDeliverable` calls `createProjectDeliverableAction`; `refreshBoard` calls `loadTeamProjectBoardAction`; that action calls `loadTeamProjectBoard(user.id, projectId)`. | Use the actual names and `user.id`; show authentication again on reload, with JWT verification conditional on an existing session cookie on each call. |
| Parent-chain reads precede ownership/deadline checks | `createProjectDeliverable` checks project, requester membership, owner, assignee membership, and deadline before `assertParentChain`. | Reorder the transaction sequence; show parent-chain existence, cycle, and depth checks before the write. |
| The flow omits invalid-field handling and implies every committed write refreshes successfully | `runAction` catches input errors; parsing occurs before the repository call. `refreshBoard` separately handles a failed reload with a saved-but-not-refreshed notice. | Add invalid-input, repository failure, and reload-failure branches. |

The sequence also shows authentication exceptions using `runAction`'s generic
fallback and `getTeamFirestore()` running before any transaction reads. A
configuration failure therefore skips the transaction rather than implying that
the database was accessed successfully.

Evidence paths: [`team-actions.ts`](../src/app/(frontend)/team-actions.ts),
[`team-deliverables.tsx`](../src/app/(frontend)/team-deliverables.tsx),
[`team-deliverables.ts`](../src/lib/team-deliverables.ts),
[`team-types.ts`](../src/lib/team-types.ts),
[`Tasks.ts`](../src/collections/Tasks.ts),
[`CalendarEvents.ts`](../src/collections/CalendarEvents.ts),
[`app-access.ts`](../src/lib/app-access.ts).

## Issue #4 acceptance comparison

The live [Issue #4](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/4)
was read on November 15, 2026; it is open and its acceptance boxes are unchecked.
These mappings identify source support, not acceptance sign-off:

| Acceptance criterion | Existing source support | Remaining proof |
| --- | --- | --- |
| Add/select collaborators by name or username | UI `searchDirectory`/member controls; actions and repository `searchDirectory`/`addProjectMember`. | Demonstrate actual discovery and addition, including accounts without directory entries. |
| Create, edit, decompose a master deliverable | Project/deliverable forms, edit actions, and `parentDeliverableId` with `assertParentChain`. | Exercise creation, editing, nested work, persistence, and access controls. |
| Distinct assignee, description, target deadline | `submitDeliverable` and parsed `DeliverableInput`; membership and deadline checks in repository. | Demonstrate saved values and retrieval; a description can be empty in current source. |
| Visual warning past the 72-hour freeze | UI `deadlineIsLate`, warning text, and submit guard; server `isDeadlineWithinReviewFreeze`. | Preview the warning and test both sides of the boundary. |
| Board grouped by assignee | UI maps `board.members` and filters deliverables by `assigneeId`. | Verify an actual multi-assignee board against design intent. |

The issue's prose says milestones must precede the freeze, while its development
task explicitly uses `<= finalDeadline - 72 hours`. The current helper and its
three unit tests permit equality. Keep `<=` in the diagrams; ask the human
reviewer to acknowledge the wording ambiguity rather than changing code.

## Figma comparison limitation

The issue supplies only the published
[prototype](https://scroll-font-26457270.figma.site/). No Figma MCP inspection
tool is available in this session, and opening the prototype through the web
tool returned an inaccessible-page error. No frame geometry, modal behavior,
component state, or visual parity is claimed reviewed. A reachable design file
and Team Deliverables frame are still needed to complete that comparison.

## Affected artifacts and verification limits

- `docs/uml/sprint-2-data-model.puml`: corrected multiplicities, description
  representation, lifecycle notes, and title reflecting implemented source.
- `docs/uml/team-deliverable-sequence.puml`: corrected creation/reload sequence.
- `docs/uml/sprint-2-data-model.svg` and
  `docs/uml/team-deliverable-sequence.svg`: regenerated from the corrected sources.
- `docs/uml/README.md`: explanations, review status, and rendering results.
- `docs/ai-design-review.md`: this evidence and pending human decision.

No Firebase configuration, repository implementation, Payload schema,
authentication, or Sprint 2 tracker is changed. PR #11 is outside this branch's
scope. No app/database tests, build, or Figma MCP review was performed.

Initially no local PlantUML renderer was found. Julian then explicitly approved
`brew install plantuml`; the installation succeeded, including Homebrew's
required dependencies. The renderer reports PlantUML 1.2026.10 and Graphviz
16.1.1. Both SVGs are now regenerated and synchronized with the sources.

Checks performed on November 15, 2026:

- `git diff --check`: passed for tracked changes; no whitespace errors.
- Read-only Python assertions: passed for the exact six-file documentation
  scope (including this untracked draft), expected branch and baseline HEAD,
  relative Markdown link targets, one start/end delimiter pair per PlantUML
  source, and balanced sequence groups.
- `plantuml -tsvg docs/uml/sprint-2-data-model.puml docs/uml/team-deliverable-sequence.puml`:
  exited 0; generated both SVGs from the updated sources.
- Separate renders of the same sources to a temporary directory matched each
  repository SVG byte-for-byte. XML parsing passed; dimensions are 1521 × 1431
  for the class diagram and 1838 × 2066 for the sequence diagram.
- Assistant visual inspection of rasterized copies of both generated SVGs:
  checked corrected labels, multiplicities, and sequence branches. This is not
  Julian's human review or approval.

Rendering checks establish source/output consistency, not application behavior
or rubric completion. No application test was run. The earlier branch creation
succeeded, although its post-checkout hook reported that the
configured Git LFS executable is missing. No hook or LFS configuration was changed.

## Human review — to be completed by Julian

- Reviewer: **pending**
- Review date: **pending**
- AI-generation provenance (tool/prompt record or author confirmation): **pending**
- Directory multiplicity correction accepted/rejected and rationale: **pending**
- Ownership/description corrections accepted/rejected and rationale: **pending**
- Sequence corrections accepted/rejected and rationale: **pending**
- Issue #4 boundary wording and collaborator-discovery limitation reviewed: **pending**
- Figma frame/tool evidence and remaining discrepancies: **pending**
- Regenerated SVGs visually reviewed: **pending**
- Final approval and review/PR reference: **pending**

Until those decisions are actually recorded, this artifact is a proposed
correction supported by source inspection, not a completed human-reviewed
AI-design correction or evidence of runtime acceptance.
