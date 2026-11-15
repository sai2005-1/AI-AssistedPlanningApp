# Sprint 2 data model

## Review status — November 15, 2026

Documentation review for T05, T06, T07, and T29 compares the source at
`8dd2e0f298b35932caa0c5f97cb3e83c0c5bb782` with GitHub Issue #4.
Corrections are drafted on `docs/sprint2-uml-design-review`; Julian's review
and approval are pending. See [the design review draft](../ai-design-review.md)
for evidence, before/after statements, acceptance mapping, and sign-off fields.
This is a source review, not proof of working persistence or Figma parity.

**Rendering verified:** after Julian approved installation, Homebrew installed
PlantUML 1.2026.10 and its dependencies, including Graphviz 16.1.1. Both SVGs
were regenerated from the current `.puml` files. Separate rerenders matched
byte-for-byte; SVG parsing, nonzero dimensions, and assistant visual inspection
passed. Human review and Figma comparison remain pending.

## Application and existing persistence

The app is React 19, Next.js 16, TypeScript, and Payload 4. Payload is configured
with `buildFigmaConfig()` and Figma-managed persistence. The current Payload
collections include `users`, `courses`, `tasks`, and `calendar-events`. Sprint 2
adds a separate Cloud Firestore data layer only for team projects; it does not
replace Payload or change its database configuration.

The original team-plan workflow parsed member names into task titles and saved
generic tasks and calendar events. It did not persist projects, project
membership, a deliverable hierarchy, or an assignee relationship.

## Story represented by the diagrams

GitHub issue [#4](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/4),
Team Deliverable Allocation & Sub-Task Delegation, is represented by the existing
team implementation and these diagrams. It requires durable project membership,
assigned deliverables, parent/child decomposition, and an interim deadline rule.
This comparison does not establish team approval of the final graded story.

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
  credential data are not stored. Each user has zero or one directory document;
  each directory document refers to one Payload user ID. This is an application
  reference, not a cross-database foreign-key constraint.
- **UserProjectIndex**: a per-directory-user `projects` subcollection used to
  list accessible projects.

These entities remain separate from the existing personal `Task` model. A
deliverable assignee must be a member of its project. A deliverable's deadline
must be on or before `finalDeadline - 72 hours`, following the issue's `<=`
development task. A parent and child must belong to the same project. Project
owners manage members and deliverable details; an assigned member can update
their deliverable's status.

Project and deliverable descriptions are stored/read as strings, including an
empty string when omitted by the form; they are not optional stored fields.
The class diagram shows selected domain fields rather than every Payload field.
Payload `Task.owner` and `CalendarEvent.owner` are optional relationships in
the schemas. App-user creation hooks assign them, while CMS-admin creation may
omit them; the diagram distinguishes schema optionality from the normal app flow.

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
6. Existing user profiles are private. Payload signup does not create a Firestore
   directory entry. `loadTeamWorkspace`, `searchDirectory` with at least two
   normalized characters, and `createTeamProject` create or refresh the current
   user's entry. Collaborator lookup searches that directory, so an existing
   Payload account can remain undiscoverable until one of those paths runs
   successfully. Creating a project is another entry-creation path, beyond the
   previously documented workspace/search paths.

## Figma review limitation

Issue #4 links to the published [Figma prototype](https://scroll-font-26457270.figma.site/),
not a Figma Design file URL with a file key and selected node. No Figma MCP
design-inspection tool is available in this session. A web open attempt on
November 15, 2026 returned an inaccessible-page error. The earlier documentation
reported seeing a sign-in screen; that historical observation was not reproduced
in this review. The Team Deliverables frame and its interactions remain
unverified. Diagrams follow the available source and issue criteria.

## Scope and database choice

Cloud Firestore was selected for the new team feature. Because it is a document
database, the implementation uses typed document models and the Firebase Admin
SDK rather than a relational ORM. Existing Payload models and persistence remain
unchanged. No migration or production data write is performed.

## Diagrams

- `sprint-2-data-model.puml` and `sprint-2-data-model.svg`: existing Payload
  entities and the implemented Firestore documents and references.
- `team-deliverable-sequence.puml` and `team-deliverable-sequence.svg`: the
  create-and-assign flow, including authentication, server validation,
  transaction checks, and a separately authenticated board reload. Input errors
  stop before repository access; a successful write can still be followed by a
  board-refresh failure. The sequence depicts source behavior, not a test run.

Both SVGs have been regenerated for this draft. To reproduce the output with
PlantUML 1.2026.10 and Graphviz 16.1.1, run from the repository root:

```sh
plantuml -tsvg docs/uml/sprint-2-data-model.puml docs/uml/team-deliverable-sequence.puml
```

Then visually inspect labels, multiplicities, and sequence branches in both
outputs. A successful render alone does not establish design correctness.

- `../firestore-setup.md`: developer credentials, document layout, and schema
  consistency guidance.
