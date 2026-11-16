# Firebase setup

## Runtime storage

Firebase Authentication owns app credentials. Cloud Firestore stores user
profiles, username reservations, Firebase UID-to-profile mappings, courses,
personal tasks, calendar events, team projects, and deliverables. User-owned
records include `ownerId`; server actions require a verified Firebase session
and repositories scope reads and writes to that ID.

The Firebase Admin SDK runs on the server. Firestore client rules and Storage
rules deny direct client access; do not loosen these rules without adding and
reviewing client authorization. Firebase Auth's web configuration is public
and uses `NEXT_PUBLIC_FIREBASE_*`. Admin service-account values are private,
server-only values and must never use a `NEXT_PUBLIC_` prefix.

## Cloud development project

1. Use a dedicated Firebase project for development. Do not point local or
   shared development at production.
2. Enable Firebase Authentication's email/password provider and Cloud
   Firestore. Configure a Firebase Web App and copy its public configuration
   into the `NEXT_PUBLIC_FIREBASE_*` variables in `.env.local`.
3. Create a server service account with the minimum Firestore permissions
   required by the app. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
   `FIREBASE_PRIVATE_KEY` in `.env.local`. Set `FIREBASE_STORAGE_BUCKET` only
   when using Firebase Storage.
4. Deploy `firestore.rules`, `firestore.indexes.json`, and `storage.rules` to
   the development Firebase project.
5. Use the Figma Make environment-variable flow for deployed previews. Never
   paste service credentials into chat, source code, issues, or documentation.

## Local emulators

Run the local Firebase Emulator Suite with:

```sh
pnpm emulators
```

Set these local-only values in `.env.local` and restart the Next.js server:

```dotenv
FIREBASE_PROJECT_ID=demo-signal
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-signal
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-signal.firebaseapp.com
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_FIREBASE_API_KEY=emulator-api-key
NEXT_PUBLIC_FIREBASE_APP_ID=emulator-app-id
```

Emulator mode does not require service-account credentials. Do not set emulator
hosts when using the cloud development project. Run the Firebase integration
tests against isolated emulators with `pnpm test:firebase`; `pnpm test` runs
unit tests and skips emulator-only cases when emulators are absent.

## Firestore layout

- `users/{profileId}` stores app profile data and role.
- `usernames/{normalizedUsername}` reserves a username for one profile.
- `authUserProfiles/{firebaseUid}` maps Firebase Auth identities to profile IDs.
- `tasks/{taskId}` stores personal tasks and `ownerId`.
- `calendarEvents/{eventId}` stores imported/planned events and `ownerId`.
- `courses/{courseId}` stores course metadata referenced by tasks/events.
- `teamProjects`, member subcollections, deliverable subcollections, and
  `teamUserDirectory` keep the existing team-workspace model.

The Admin SDK bypasses Firestore Rules. Authorization therefore lives in
`src/lib/app-auth.ts`, `src/lib/app-data.ts`, and
`src/lib/team-deliverables.ts`; rules remain deny-by-default for browser
Firestore access. The committed indexes cover current owner-scoped queries.

## Existing Payload data and cutover status

New app signups, sessions, task writes, calendar imports, workflow plans,
completion changes, and dashboard reads now use Firebase services. The existing
Payload collections and generated admin/API routes remain available while
their records await a verified export and reconciliation. The app does not
dual-write between Payload and Firestore.

Existing Payload users, tasks, calendar events, courses, CMS content, and media
have **not** been imported by this change. Firebase Auth does not accept
Payload password hashes as Firebase credentials; existing users need a
verified account-link/reset flow that preserves profile IDs referenced by team
projects. Do not switch production traffic or remove Payload collections until
the team has exported the source data, migrated it to a development Firebase
project, reconciled counts and ownership, and verified rollback. Payload content
export/migration tooling was unavailable in this workspace, so no document
mutation or ad hoc REST transfer was run.
