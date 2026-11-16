# Firebase setup

## Database decision

Firebase Authentication and Cloud Firestore are the selected application data
stack for Issue #15. Firestore is a natural fit for the current domain because
tasks, calendar events, courses, team projects, and deliverables are owner-scoped
documents queried by account and date. The project already depended on Firebase
Admin for team data, so extending that SDK avoids a second database, an ORM
runtime, and cross-store ownership rules. Authentication is provided by Firebase
Auth; passwords are never stored in Firestore.

The relational-ORM step is not applicable: Firestore is a document database.
The equivalent is the Firebase Admin SDK plus typed contracts in
`src/lib/firestore-models.ts` and `src/lib/team-types.ts`. Firestore has no
relational migration mechanism; version-controlled security rules and composite
indexes in `firestore.rules`, `storage.rules`, and `firestore.indexes.json` are
the required database setup. Additive document changes should be deployed
reader-first and recorded with the corresponding model/index changes.

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

To seed development data, first sign up through the app while the Auth and
Firestore emulators are running. Then run the seed script with that emulator
account's email:

```sh
FIREBASE_PROJECT_ID=demo-signal \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIREBASE_SEED_USER_EMAIL=you@example.test \
pnpm seed:emulator
```

The script requires the exact demo project and loopback emulator endpoints,
verifies that the Auth account has an app profile, and idempotently creates one
course and one task. It refuses to run against cloud Firebase.

## Firestore layout

- `users/{profileId}` stores app profile data and role.
- `usernames/{normalizedUsername}` reserves a username for one profile.
- `authUserProfiles/{firebaseUid}` maps Firebase Auth identities to profile IDs.
- `tasks/{taskId}` stores personal tasks and `ownerId`.
- `calendarEvents/{eventId}` stores imported/planned events and `ownerId`.
- `courses/{courseId}` stores user-owned course metadata referenced by tasks.
- `teamProjects`, member subcollections, deliverable subcollections, and
  `teamUserDirectory` keep the existing team-workspace model.

The Admin SDK bypasses Firestore Rules. Authorization therefore lives in
`src/lib/app-auth.ts`, `src/lib/app-data.ts`, and
`src/lib/team-deliverables.ts`; rules remain deny-by-default for browser
Firestore access. The committed indexes cover current owner-scoped queries.

## Payload boundary

The app's authentication, courses, tasks, calendar events, and team workspaces
use Firebase services. `src/payload.config.ts` retains `buildFigmaConfig()` and
registers only the Figma-managed `Admins` collection for the platform control
plane. The generated Payload admin/API routes remain, but the retired app
collections are no longer registered or available through those routes.

The former Payload CMS collections (`Users`, `Tasks`, `CalendarEvents`,
`Courses`, `Media`, `Folders`, `Tags`, and `Posts`) were intentionally
unregistered without export, following the user's confirmation that no
important app data needed preservation. Their old records are not imported or
available through the current app configuration. Firebase Auth credentials and
profiles are independent of Payload Admin accounts.

The old Media upload collection had no frontend consumer. It is retired rather
than replaced by an unused upload interface; if app media uploads are added,
store metadata in Firestore and binaries in Firebase Storage with explicit
owner-scoped authorization. Storage rules currently deny direct client access.
