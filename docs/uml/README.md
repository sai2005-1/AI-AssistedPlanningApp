# Sprint 2 data model

## Application and existing persistence

The app is React 19, Next.js 16, TypeScript, and Payload 4. Payload is configured
with `buildFigmaConfig()` and Figma-managed persistence. The current Payload
collections include `users`, `courses`, `tasks`, and `calendar-events`. Sprint 2
adds a separate Cloud Firestore data layer only for team projects; it does not
replace Payload or change its database configuration.

The original team-plan workflow parsed member names into task titles and saved
generic tasks and calendar events. It did not persist projects, project
membership, a deliverable hierarchy, or an assignee relationship.

## Story selected for implementation

GitHub issue [#4](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/4),
Team Deliverable Allocation & Sub-Task Delegation, is the best fit for a
persistent-data sequence: it requires durable project membership, assigned
deliverables, parent/child decomposition, and an interim deadline rule.

## Implemented Firestore model

- **TeamProject**: `teamProjects/{projectId}` stores title, description, final
  deadline, owner Payload user ID, and timestamps.
- **ProjectMember**: a project subcollection document keyed by the encoded
  Payload user ID, which enforces one membership per project/user pair.
- **Deliverable**: a project subcollection document with an optional parent,
  required project-member assignee, due date, status, and assignee display
  snapshot.
- **TeamUserDirectory**: `teamUserDirectory/{encodedUserId}` mirrors only the
  signed-in user's name and username for collaborator search; email and
  credential data are not stored.
- **UserProjectIndex**: a per-directory-user `projects` subcollection used to
  list accessible projects.

These entities remain separate from the existing personal `Task` model. A
deliverable assignee must be a member of its project. A deliverable's deadline
must be on or before `finalDeadline - 72 hours`, following the issue's `<=`
development task. A parent and child must belong to the same project. Project
owners manage members and deliverable details; an assigned member can update
their deliverable's status.

## Assumptions and questions to resolve

1. Collaborators are existing app users selected by username; invitations and
   external email addresses are out of scope.
2. The project creator is the project owner. Only owners add members and edit
   project/deliverable details; members can view project content and update the
   status of work assigned to them.
3. The issue does not define project statuses, deliverable statuses, deletion
   behavior, or whether completed work can be edited. The implementation uses
   `open / in-progress / done` deliverable statuses and has no delete action.
4. The issue says milestones must precede the 72-hour freeze, while its
   development task says `<=`; this implementation permits the exact boundary.
5. The issue does not specify a project timezone. The UI interprets the
   creator's `datetime-local` values in their browser timezone, stores UTC
   instants, and formats dates in each viewer's browser timezone. Teams that
   span timezones may want a project-level timezone in a later schema change.
6. Existing user profiles are private. A name/username directory entry is
   refreshed only when a user opens or searches the Team Deliverables screen,
   so existing accounts become searchable after their first visit.

## Figma review limitation

The available backlog reference is a published `figma.site` prototype, not a
Figma Design file URL with a file key and selected node. The MCP design-context
workflow also requires guidance that is not available in this session. The
prototype URL responded with a sign-in screen, so the Team Deliverables frame
and its interactions could not be verified. The diagram is based on the source
code and issue acceptance criteria, not a claim of Figma parity.

## Scope and database choice

Cloud Firestore was selected for the new team feature. Because it is a document
database, the implementation uses typed document models and the Firebase Admin
SDK rather than a relational ORM. Existing Payload models and persistence remain
unchanged. No migration or production data write is performed.

## Diagrams

- `sprint-2-data-model.puml` and `sprint-2-data-model.svg`: existing Payload
  entities and the implemented Firestore documents and references.
- `team-deliverable-sequence.puml` and `team-deliverable-sequence.svg`: the
  authenticated create-and-assign flow backed by a Firestore transaction.

The SVGs are rendered from their PlantUML sources. Update both the `.puml` and
rendered `.svg` whenever the persisted model or sequence changes.

- `../firestore-setup.md`: developer credentials, document layout, and schema
  consistency guidance.
