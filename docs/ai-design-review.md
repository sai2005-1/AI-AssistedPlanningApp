# Sprint 2 AI-assisted design review — one human decision accepted

Review date: November 15, 2026. Assigned documentation scope: T05 and T29;
related diagram follow-up: T06 and T07.
Current source baseline: `fe73e6783ece13b209b3ea42fe742673db21ac13` on `main`.
Local `main` and freshly fetched `origin/main` matched that SHA before branching.
Documentation branch: `docs/sprint2-accepted-directory-review`.
Only this review document is changed in this follow-up.

## Status and provenance

The human reviewer has explicitly agreed to the directory multiplicity correction
below. That single decision is **ACCEPTED**. Technical reasoning is AI-drafted
from current source inspection and is labeled separately; agreement with the
correction is not evidence that the reviewer authored or approved all reasoning.
No Sprint 2 task or rubric item is marked verified by this update.

**The original diagrams' AI-generation provenance remains unverified.** The
previous review traced their first appearance to commit `8dd2e0f`, but that does
not establish the generating tool, prompt, or human reviewer. The task's
AI-generated-design description is context, not independent provenance evidence.
Obtain a generation record or author confirmation before claiming that rubric
requirement is satisfied. Do not attribute the original assumption to Sai personally.

## Human decision — ACCEPTED

- Reviewer: human reviewer, agreement explicitly relayed in the task request;
  individual reviewer identity was not separately supplied.
- Recorded: November 15, 2026.
- Evidence: the human instruction for this documentation update states:
  “An application user does not need to have a team-directory entry. The relationship should permit zero or one directory entries per user (0..1), not require exactly one.”
- Decision: **ACCEPTED**, limited to the optional directory relationship.
- Approval scope: this does not approve the full class/sequence diagrams,
  ownership/description findings, Figma parity, or runtime acceptance.

Original relationship recorded in the earlier review:

```plantuml
User "1" <-- "1" TeamUserDirectory : userId reference
```

Accepted relationship:

```plantuml
User "1" <-- "0..1" TeamUserDirectory : userId reference
```

The current [class diagram source](uml/sprint-2-data-model.puml) already contains
the accepted `0..1` relationship. This follow-up records acceptance; it does not
change or regenerate either diagram or claim full human approval of their SVGs.

## AI-drafted technical rationale — current source evidence

1. The signup branch in [AuthScreen](../src/app/(frontend)/auth-screen.tsx)
   calls Firebase Auth `createUserWithEmailAndPassword`, then sends an ID token,
   name, and username to [signupAction](../src/app/(frontend)/auth-actions.ts).
2. [appAuth.signup](../src/lib/app-auth.ts) verifies the Firebase ID token and
   writes `users/{uid}`, `usernames/{normalizedUsername}`, and
   `authUserProfiles/{uid}` in a Firestore transaction. It then establishes the
   application session. Neither signup nor its session/profile helpers writes
   `teamUserDirectory` or calls the team repository. **Signup does not
   automatically create a team-directory record.**
3. In the [team repository](../src/lib/team-deliverables.ts),
   `directoryReference` uses `teamUserDirectory/{encodeURIComponent(user.id)}`.
   The deterministic key gives one directory-document location per application
   user ID in these write paths. `loadTeamWorkspace` upserts that user's entry;
   `searchDirectory` does so only after the normalized query reaches two
   characters; `createTeamProject` upserts it in the project-creation batch.
4. `searchDirectory` searches directory fields, rather than all Firestore user
   profiles. `addProjectMember` queries `usernameNormalized` in that directory
   and rejects an empty match with “No matching teammate is in the collaborator
   directory yet.” For an existing match, it checks project ownership and writes
   project membership plus the teammate's project index in a transaction.

An application profile can therefore exist with no directory entry until a later
team operation succeeds. Subsequent UI activity may create one, but that does
not make it a signup requirement. Each directory entry references one application
user ID; each user has zero or one entry through the current repository paths.
This is an application-level reference and keying convention, not a Firestore
foreign-key, cascade, or global uniqueness guarantee for arbitrary external writes.
No live signup, database write, or persistence experiment was performed here.

## Outdated Payload references — corrections still needing implementation

The earlier review used baseline `8dd2e0f298b35932caa0c5f97cb3e83c0c5bb782`.
Its Payload-based reasoning is superseded by the current Firebase Auth/Firestore
implementation. Payload remains configured for CMS administration; it is not
current application-user authentication. The following documentation and diagram
corrections remain **pending implementation and review** outside this one-file
update:

| Outdated statement/artifact | Current source evidence | Required follow-up |
| --- | --- | --- |
| Earlier review: `createAppAuth().signup` creates a Payload user; a `Users` hook establishes the lifecycle | `app-auth.ts` exports `appAuth`; signup writes Firebase-backed profile/index documents. `src/collections/Users.ts` no longer exists. | This review's signup rationale and links are corrected above. Update the same claim in `docs/uml/README.md` and the class diagram note/SVG. |
| Class legend, `PayloadID` attributes, README: users/tasks/calendar/courses use Payload; only teams use Firestore | [Firestore models](../src/lib/firestore-models.ts) and [app-data.ts](../src/lib/app-data.ts) define and persist personal records in Firestore. [Payload configuration](../src/payload.config.ts) registers `Admins`, not the former application collections. | Revise class entities, IDs, fields, relationships, persistence legend, README, and rendered SVG against current typed models. Preserve the managed Payload admin configuration. |
| README/class note: team references are Payload user IDs and signup is Payload-based | `AppUser.id` is a string Firestore profile ID. `profileForAuthUid` resolves `authUserProfiles.profileId`, falling back to the Firebase Auth UID; signup uses that UID for the profile ID. Team repository uses `user.id`. | Describe application profile IDs and Auth UID mapping accurately; remove the Payload and cross-database descriptions. |
| Sequence source/SVG: `JWTAuthentication()` against a Payload database | `currentUser` calls Firebase Admin `verifySessionCookie`, then reads the Firestore profile through `profileForAuthUid`. [Team actions](../src/app/(frontend)/team-actions.ts) call `requireAppUser` on creation and reload. | Replace Payload authentication messages with conditional Firebase session verification and Firestore profile resolution, including failure behavior; regenerate and review the SVG. |
| Earlier ownership finding: `Tasks.ts`/`CalendarEvents.ts` and Payload hooks make ownership optional | Those collection files no longer exist. `FirestoreOwnedDocument` requires `ownerId: string`; current `app-data.ts` writes and checks `ownerId`. | Re-audit class ownership multiplicities and course/task/event fields against current models and repository behavior. The historical optional-owner finding is not a current accepted conclusion. |
| `docs/sprint2/AGENT_INSTRUCTIONS.md` and `progress.json` describe the old hybrid boundary and source baseline | Current source uses Firebase Auth/Firestore for application accounts and personal/team data, while managed Payload CMS admin remains. | Reconcile architecture, task observations, and approval records in a separately scoped tracker/instructions update. Source migration alone does not prove team architecture approval. |

The [UML README](uml/README.md), [class source](uml/sprint-2-data-model.puml),
[class SVG](uml/sprint-2-data-model.svg), [sequence source](uml/team-deliverable-sequence.puml),
and [sequence SVG](uml/team-deliverable-sequence.svg) retain these stale statements.
Their prior rendering checks do not establish accuracy against current main.
The previous source review also proposed description-field and sequence-order/error
corrections; those remain subject to human review and current-source reconciliation.

## Issue #4 and remaining review requirements

[Issue #4](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/4) was read
again on November 15, 2026. It remains open with unchecked acceptance criteria.
Source inspection supports directory lookup, project/member operations, and
assigned deliverables in the team repository; it does not demonstrate acceptance.

Still required:

- Identify the reviewer and attach a durable review/PR reference for this relayed
  agreement; do not invent a named reviewer or independent sign-off.
- Verify original AI-generation provenance with a tool/prompt record or author
  confirmation before claiming the human-reviewed AI-correction rubric complete.
- Implement and review the pending Firebase documentation/diagram corrections,
  regenerate affected SVGs, and obtain human visual review and full diagram approval.
- Obtain Figma MCP evidence for the Team Deliverables frame and compare it with
  the implementation. No Figma MCP inspection or visual-parity approval occurred
  in this follow-up. The issue's published prototype link is not such evidence.
- Review the other ownership, description, sequence, and failure-path findings.
- Resolve the issue's “precede” versus `<= final deadline minus 72 hours` wording;
  the current [deadline helper](../src/lib/team-deliverable-rules.ts) permits equality.
- Demonstrate collaborator discovery (including accounts without entries), project
  creation/editing, assignment, hierarchy, deadline warnings, board grouping,
  authorization, and persistence through real acceptance tests.

This acceptance does not complete T05, T06, T07, T29, Figma review, architecture
approval, or Issue #4 acceptance. The dated tracker remains unchanged.

## Verification for this documentation update

Checks on November 15, 2026:

- Fetched `origin/main`; confirmed local main and the new branch baseline matched
  `fe73e6783ece13b209b3ea42fe742673db21ac13`; initial working tree was clean.
- Checked this document's relative Markdown links and local heading fragments;
  all targets exist. The linked GitHub Issue #4 was read through the connector.
- `git diff --check`: passed.
- Reviewed the diff and staged paths for the single-file documentation scope.

No runtime code, authentication, database schema, environment configuration,
tracker, or diagram artifact was changed. No application tests, production build,
Figma MCP review, or new diagram render was performed for this documentation-only
update. Historical rendering evidence from the earlier review is not claimed as
new verification of the migrated implementation.
