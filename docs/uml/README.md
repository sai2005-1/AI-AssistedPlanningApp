# Firebase Application Data Model

## Technology And Mode

The app uses Next.js, React, TypeScript, Firebase Authentication for credentials,
Cloud Firestore for app data, `firebase` for browser Auth, and `firebase-admin`
for server-side Auth and Firestore access. Team projects and personal planning
data share the same Firebase project and repository boundary.

`pnpm dev` selects the local Auth/Firestore/Storage Emulator Suite. Use
`pnpm dev:cloud` with a dedicated development Firebase project to test shared
persistent data. `FIREBASE_MODE` and `NEXT_PUBLIC_FIREBASE_MODE` must agree;
cloud mode rejects emulator host variables. Never use production as a development
target.

## Typed Document Contracts

`src/lib/firestore-models.ts` defines the persisted user-profile, course, task,
and calendar-event document contracts. `src/lib/team-types.ts` defines the
project/member/deliverable view and input types; the corresponding Firestore
document shapes are written by `src/lib/team-deliverables.ts`.

## Collection Layout And References

- `users/{profileId}` stores the app profile and role.
- `usernames/{normalizedUsername}` reserves a username for one profile.
- `authUserProfiles/{firebaseUid}` maps Firebase Auth identities to profiles.
- `courses/{courseId}` stores an owner-scoped course; codes are unique per owner.
- `tasks/{taskId}` stores scored work with `ownerId`, optional `courseId`, and
  optional `calendarEventId` references.
- `calendarEvents/{eventId}` stores imported/planned events with `ownerId`,
  optional `courseId`, and a deduplication `sourceKey`.
- `teamProjects/{projectId}` stores project metadata and its owner reference.
- `teamProjects/{projectId}/members/{encodedUserId}` stores membership; the
  encoded user ID is the membership key.
- `teamProjects/{projectId}/deliverables/{deliverableId}` stores assigned work
  and an optional parent in the same project.
- `teamUserDirectory/{encodedUserId}` stores minimal collaborator search data;
  its `projects/{projectId}` subcollection indexes accessible projects.

App-data dates are ISO strings; team-project and deliverable dates are Firestore
`Timestamp` values. User credentials remain in Firebase Auth. Team deliverables
remain separate from personal task documents. Repository invariants require
assignees to be project members, parents to stay within their project, and
deliverable dates to be at least 72 hours before final submission.

## Repositories, Rules, And Indexes

- `src/lib/app-auth.ts` verifies Firebase ID/session tokens, links Auth UIDs to
  Firestore profiles, and manages HTTP-only session cookies.
- `src/lib/app-data.ts` owns account-scoped task, course, calendar, workflow,
  completion, and replanning reads/writes.
- `src/lib/team-deliverables.ts` owns project membership, deliverables, and
  deadline/parent invariants.
- Frontend Server Actions validate input and call these repositories; UI
  components do not access Firestore directly.

`firestore.rules` denies browser reads/writes because Admin SDK calls bypass
Rules and repository functions enforce ownership. `firestore.indexes.json`
defines the current owner-scoped composite indexes. `storage.rules` denies
client file access; no app upload flow currently uses Firebase Storage.

Firestore has no relational ORM migration system. The equivalent schema setup
is typed document contracts plus committed security rules and indexes. Additive
document changes should update models and indexes together.

## Development Seed

After creating a disposable user through the app with emulators running, use
`pnpm seed:emulator` with `FIREBASE_SEED_USER_EMAIL` set to that account. The
script verifies the Auth/profile mapping and seeds a deterministic course and
task. It refuses to run unless the project is `demo-signal` and Auth/Firestore
hosts are the local loopback emulator endpoints.

## Diagrams And Validation

- `sprint-2-data-model.puml` / `.svg` show Firebase Auth, Firestore collections,
  document references, ownership, team subcollections, rules, and indexes.
- `team-deliverable-sequence.puml` / `.svg` show signup/session setup, Quick Add
  task creation, repository validation, Firestore persistence, and feed reload.

With PlantUML and Graphviz installed, regenerate both SVGs from the repository
root:

```sh
plantuml -tsvg docs/uml/sprint-2-data-model.puml docs/uml/team-deliverable-sequence.puml
```

Run `pnpm test:firebase` for emulator-backed Auth/Firestore integration tests.
`../firestore-setup.md` documents cloud/emulator mode selection and seed setup.
