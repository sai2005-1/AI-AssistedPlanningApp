# Signal Gemini Advisor

The Advisor has two modes. **Ask Gemini** sends the prompt you submit and a
bounded recent Gemini conversation to Google. **Local commands** uses the
existing task, syllabus, exam, team-navigation, score-explanation, and replanning
handlers. It does not send its prompts or results to Google.

Stored tasks, selected-task details, calendar events, user profiles, and database
records are not automatically attached to Gemini requests. Students can paste
schedule details they choose to share. The UI displays this disclosure before
the chat form. Conversation state is held in memory in the open Advisor screen;
Clear chat removes it locally. This does not delete any data processed by Google.

## Server configuration

Use Node.js `>=22.0.0`, matching `package.json` and the installed `@google/genai`
3.3.0 SDK. The project's `.mise.toml` specifies compatible Node 24.15.0; the
verification shell ran compatible Node 24.21.0. In Figma Make, configure these variables
through the environment-variable card flow. For local development, keep real
values only in the ignored `.env.local`, using your local editor/secret tooling;
never paste them into chat, source, commits, screenshots, or test reports.

```dotenv
# Placeholder only; replace privately in the server environment.
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart the local runtime after setting environment variables. The key must not
use a `NEXT_PUBLIC_` prefix or appear in `next.config.ts`'s `env` section.
`GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`. A valid model name
does not establish model availability or quota for your Google project. An
unavailable model or missing key produces a usable local-command fallback.

The SDK is instantiated only in `src/lib/gemini.ts`, protected by `server-only`.
The server action uses the existing `requireAppUser()` authentication helper.
After main's Firebase migration, that helper verifies the Firebase session cookie
with revocation checking and resolves the Firestore user profile. The Gemini
adapter and chat action do not query task/calendar records or perform database
writes; authentication remains owned by the existing Firebase implementation.
See `docs/firestore-setup.md` for cloud/emulator configuration. Existing Payload
CMS/admin configuration is preserved separately.

## Limits and approval

- Maximum prompt: 4,000 characters; at most six prior conversation turns.
- Maximum combined submitted context: 12,000 characters. The client drops whole
  oldest Gemini exchanges when necessary; the server independently validates.
- Maximum reply: 6,000 characters; output budget: 1,500 tokens.
- Application timeout: 20 seconds; SDK HTTP timeout: 20 seconds; no automatic
  retries. Aborting locally does not guarantee Google cancels processing/billing.
- Ten authenticated requests per user per minute, with a bounded 1,000-user
  process-local budget map. This is not a distributed quota/billing guarantee;
  configure provider project quotas for any wider deployment.
- Only completed plain-text replies are accepted. Optional text metadata such
  as `thoughtSignature`, `partMetadata`, and `speechMetadata` is accepted but
  discarded; only visible text is returned. Blocked, truncated, empty,
  oversized, thinking text, or tool content produces a sanitized error. Raw provider
  exceptions, prompts, keys, and task data are not logged by this integration.

Gemini replies are advice/proposals rendered as plain text. No function calling,
automatic plan execution, or persistence path is configured. To save changes,
the student must explicitly enter a local command and select **Approve and
apply**. Replanning also requires approval. The confirmation describes the
submitted command and the existing local operation it will run. A local command
can partially succeed according to the existing server actions; refresh/check
the plan before retrying after a failure. Existing Quick add and other app
features retain their own save controls.

## Offline tests and remaining verification

```sh
TZ=UTC pnpm test
pnpm exec tsc --noEmit --incremental false
git diff --check
git check-ignore -v .env.local
```

`gemini.test.ts` mocks the entire Google SDK; `advisor-actions.test.ts` mocks auth
and the provider adapter. `signal-advisor.test.tsx` uses the existing installed
Happy DOM test environment with mocked actions to exercise chat, confirmation,
cancellation, local fallback, and separation of local/private data from Gemini
history. No real credentials or paid/live API calls are used.
Tests cover success, context mapping, authentication, missing keys, validation,
quota/status errors, timeout/abort, invalid responses, and deterministic local
command routing. `advisor-firebase-auth.test.ts` exercises the actual migrated
`requireAppUser()` and chat action with mocked Firebase I/O and Google calls.
It covers session verification, profile resolution, missing/revoked sessions,
missing/mismatched profiles, and sanitized profile-read failures.
Authenticated browser interaction still requires separate manual verification;
test success alone does not prove production delivery or the full Sprint 2
persistence rubric. The user reported a separate successful live smoke test
with `gemini-3.5-flash-lite` (HTTP 200, `SIGNAL_OK`); this merge verification
made no live Gemini requests.

Verification on November 15, 2026 (branch `feat/signal-gemini-integration`, based
on `cca5042`; PRs #13/#14 remain separate):

- `TZ=UTC pnpm test`: 92 passed across five files; exit 0. This includes the
  three tests on current main and 89 new mocked/contract/UI interaction cases,
  including text metadata compatibility and validation regression tests.
- `pnpm exec tsc --noEmit --incremental false`: passed, exit 0. The baseline
  typecheck also passed before implementation.
- `git diff --check`: passed; `.env.local` matches the existing `.env*` ignore rule.
- `pnpm build`: blocked before compilation by the existing Figma-managed
  configuration: `Environment ID could not be resolved` (`FIGMA_EID` unavailable
  in this shell). Do not add dummy platform values or initialize a replacement
  backend to bypass this execution-context limitation.
- `figma make verify-deploy`: unavailable (`figma` command not found). No app
  server responded on localhost:3000 during inspection. Authenticated route,
  production route table, and real Google-response verification remain pending
  in the connected Make runtime. No production publication was attempted.

Merge verification on November 15, 2026, incorporating `origin/main` at
`2523c7b` into `feat/signal-gemini-integration`:

- `TZ=UTC pnpm test`: 98 passed, two emulator-only tests skipped across eight
  files, exit 0. Those two tests ran separately against local emulators.
- `TZ=UTC CI=1 FIREBASE_PROJECT_ID=demo-signal pnpm test:firebase`: two tests
  passed across two files on both subsequent runs, exit 0, including the final
  pre-commit verification. The recovered initial invocation output shows that
  `app-data.test.ts:34` exceeded Vitest's 5,000 ms test timeout; it did not report
  an assertion failure. The final run completed that test in about 3.6 seconds.
  Both successful runs emitted a metadata lookup warning
  (`ETIMEDOUT, ENOTFOUND`). No production code or test timeout was changed.
- `pnpm exec tsc --noEmit --incremental false`: passed, exit 0.
- Working-tree and staged `git diff --check`: passed; no unmerged entries or
  conflict markers remain.
- `.env.local` remained byte-for-byte unchanged and ignored by Git. New cloud
  Firebase browser configuration variables are documented in `.env.example`;
  they have not been added to the local environment. Development uses Sai's
  existing emulator defaults. No cloud configuration or browser sign-in was
  verified during this merge.
- The earlier build/production verification limitations above were not
  re-evaluated in this merge session.

Official references: [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/)
and [Gemini API text generation](https://ai.google.dev/gemini-api/docs/text-generation).
