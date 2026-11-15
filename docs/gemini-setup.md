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
GEMINI_MODEL=gemini-2.5-flash
```

Restart the local runtime after setting environment variables. The key must not
use a `NEXT_PUBLIC_` prefix or appear in `next.config.ts`'s `env` section.
`GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`. A valid model name
does not establish model availability or quota for your Google project. An
unavailable model or missing key produces a usable local-command fallback.

The SDK is instantiated only in `src/lib/gemini.ts`, protected by `server-only`.
The server action uses the existing `requireAppUser()` authentication helper;
authentication and database schemas are unchanged. Neither the Gemini adapter
nor the chat action queries task/calendar records or performs database writes.
The existing authentication helper may access Payload to verify the session.

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
command routing. A live Google response and authenticated browser interaction
still require separate manual verification; test success alone does not prove
production delivery or the full Sprint 2 persistence rubric.

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

Official references: [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/)
and [Gemini API text generation](https://ai.google.dev/gemini-api/docs/text-generation).
