# Firestore setup for team deliverables

## What is stored where

Payload remains the source of truth for app accounts, courses, personal tasks,
calendar events, and CMS content. Cloud Firestore stores only the Sprint 2
team-project feature: project documents, project-member subcollections,
deliverable subcollections, and a name/username-only collaborator directory.
The Firestore records refer to existing Payload users by their string ID; no
email, password, or Payload auth token is copied to Firestore.

## Per-developer configuration

1. Use a separate Firebase project and Firestore database for each development
   environment. Do not point local development at production.
2. Enable Cloud Firestore and create a dedicated service account with only the
   Firestore data permissions needed by the app.
3. Add `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
   `FIREBASE_PRIVATE_KEY` to a local `.env.local`, using credentials for the
   development project. `.env.local` is ignored by Git; `.env.example` contains
   placeholders only.
4. In Figma Make, configure these values using the environment-variable
   settings flow. Never paste credentials into chat, source code, issues, or
   documentation. Keep all three variables server-side; do not add a
   `NEXT_PUBLIC_` prefix.
5. Start the app through the normal Make development lifecycle. If the
   Firestore variables are missing, the Team Deliverables screen shows a
   configuration error; other Payload-backed screens remain separate.

The Firebase Admin SDK is initialized only in `src/lib/firebase-admin.ts`.
`src/lib/team-deliverables.ts` contains Firestore access and invariants, while
`src/app/(frontend)/team-actions.ts` authenticates and validates each
user-facing operation. The browser never receives service-account credentials
or calls Firestore directly. Admin SDK calls bypass Firestore Security Rules, so
authorization must remain enforced in these server-side operations.

## Firestore document layout

- `teamProjects/{projectId}` stores project title, description, final deadline,
  owner Payload user ID, and timestamps.
- `teamProjects/{projectId}/members/{encodedUserId}` stores project membership
  and display name/username. The document ID makes project/user membership
  unique.
- `teamProjects/{projectId}/deliverables/{deliverableId}` stores title,
  description, due date, status, assignee, and optional parent deliverable.
- `teamUserDirectory/{encodedUserId}` stores only Payload user ID, name,
  username, normalized search fields, and update time. Its `projects` child
  collection is a per-user index of the projects they can access.

The current app has no user-directory read access for other users. A signed-in
user's directory entry is refreshed when they open or search the Team
Deliverables screen, so a teammate becomes searchable after first opening that
screen. Only names and usernames are searchable; email addresses are not
stored or returned.

## Schema and environment consistency

Firestore has no relational ORM or migration files in this integration. Keep
document shapes in `src/lib/team-types.ts` and validate writes in the server
actions and data-access layer. Make schema changes additively where possible;
deploy compatible readers before depending on newly added fields. If future
queries require composite indexes, commit the matching Firestore index
configuration alongside the query change.

Each developer should use a separate Firebase development project and their
own service-account credentials. Do not seed, migrate, or modify production
Firestore as part of local development. No Firestore connection or document
write is run by this implementation task.
