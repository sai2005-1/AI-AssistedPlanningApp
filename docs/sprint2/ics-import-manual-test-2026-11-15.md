# Sprint 2 — Manual .ics Calendar Import Verification

**Project:** Signal — AI-Assisted Planning App  
**Test date:** November 15, 2026 (America/New_York)  
**Tester:** Julian Roberts (`robertsjulian`)  
**Feature:** Authenticated `.ics` file import → Firestore calendar events → priority task synchronization  
**Related GitHub issues:** [#6 — Work on import .ics](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/6) (basic importer, closed); [#26 — individual-contribution audit](https://github.com/sai2005-1/AI-AssistedPlanningApp/issues/26) (separate rubric item)  
**Rubric:** R06 — Database-integrated user story (25 pts), with supporting R09 testing evidence.

## Purpose and scope

Demonstrate that a signed-in student can import an `.ics` schedule through the Signal Semester Map UI; that the application creates calendar events and linked priority tasks; that reimporting the same file avoids duplicate records; and that an empty calendar produces an actionable error.

This is a **manual local UI test** recorded from tester observations and screenshots, not an independent production or cloud deployment test. The tester did not report which exact Firebase backend mode was active, so the report does **not** claim a cloud deployment was tested.

## Manual test record

| ID | Steps | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| ICS-01 | Sign in, open Semester Map, upload `signal_fake_student_schedule.ics`, select Import Calendar. | 16 events imported, 4 priority tasks synced, 0 duplicates. | UI banner: **`imported 16 events, synced 4 priority tasks; 0 duplicates skipped.`** Semester Map populated with imported entries; sidebar displayed 4 tasks and 16 events. | **PASS** |
| ICS-02 | Upload the **same file** a second time. | No additional events or tasks; all original events recognized as duplicates. | UI banner: **`imported 0 events, synced 0 priority tasks; 16 duplicates skipped.`** | **PASS** |
| ICS-03 | Refresh the UI, then sign out and sign in again without intentionally restarting the backend. | Imported records remain available to the same user. | Tester confirmed records remained visible after refresh and reauthentication. No separate screenshot of this check was provided. | **PASS (tester-reported)** |
| ICS-04 | Upload `signal_empty_calendar_test.ics` containing `BEGIN:VCALENDAR`, `VERSION:2.0`, `END:VCALENDAR` and no VEVENT. | Reject an empty event feed gracefully with a useful error. | UI parser message: **`No VEVENT entries were found in that calendar.`** No crash reported. | **PASS** |

### Screenshot evidence supplied by tester

The tester provided three screenshots in the ChatGPT testing conversation on November 15, 2026:

1. **`Screenshot 2026-11-15 at 11.47.01 PM.png`** — Semester Map showing first-import success, 16 imported events and 4 synced priority tasks. The upcoming pane heading displayed **15 EVENTS**, while the import and sidebar totals displayed 16; the difference may be due to view filtering, but its cause was **not independently verified**.
2. **`Screenshot 2026-11-15 at 11.47.35 PM.png`** — Duplicate import success: 0 imported, 0 tasks synced, 16 duplicates skipped.
3. **`Screenshot 2026-11-15 at 11.49.58 PM.png`** — Controlled invalid-input response: `No VEVENT entries were found in that calendar.`

**Evidence retention:** The images were supplied in the testing conversation and are **not included in this documentation commit**. Attach the three screenshot files in the GitHub PR/Issue or submission package before citing them as repository-hosted attachments.

### Test fixtures

- `signal_fake_student_schedule.ics`: synthetic student calendar covering November 16–December 4, 2026 with 16 expected expanded events and four assignment/deadline records.
- `signal_empty_calendar_test.ics`: deliberately valid VCALENDAR wrapper with no VEVENT entries.

Both were synthetic, not student-private calendars. The fixtures were supplied in the test conversation; their byte-for-byte contents are not part of this documentation commit.

## Implementation traceability

- `src/lib/ics.ts`: `parseICS` reads VEVENT records and expands supported recurrence rules.
- `src/app/(frontend)/actions.ts`: `importCalendarAction` authenticates the user, accepts file/URL imports, handles parser errors, and reports imported/duplicate/task counts.
- `src/lib/app-data.ts`: `importUserCalendar` writes owner-scoped Firestore calendar entries, deduplicates by UID + start, and calls `syncAssignmentTasks` to create linked priority tasks.
- [PR #13](https://github.com/sai2005-1/AI-AssistedPlanningApp/pull/13): ICS parser and deadline-rule automated coverage.
- [PR #14](https://github.com/sai2005-1/AI-AssistedPlanningApp/pull/14): calendar classification and task-scoring automated coverage.

Separate local automated checks reported previously: `TZ=UTC pnpm test` — 220 passed, 5 expected failures, 3 skipped; `pnpm test:firebase` — 3 passed against local Auth/Firestore emulators. These are **not** a substitute for the manual UI evidence.

## Outstanding acceptance evidence — do not mark complete yet

- [ ] Demonstrate that imported records persist after a **full application server restart** while retaining the underlying database.
- [ ] Demonstrate persistence against the team's intended **Firebase Cloud** development environment, if required for final grading.
- [ ] Capture clear evidence of Firestore records and user-scoped retrieval; browser UI alone supports application retrieval but is not a direct database-console inspection.
- [ ] Attach the three original screenshots to the PR/Issue/submission record.
- [ ] Confirm with the team/instructor that basic `.ics` import (Issue #6) is the selected 25-point graded story and that its acceptance criteria are adequate. The broader syllabus-import stories (#1/#5) have additional requirements and must not be treated as equivalent.
- [ ] Resolve or separately track known parser limitations documented by expected-failing tests (TZID, RRULE INTERVAL, EXDATE, backslash escaping, invalid dates).

**Assessment:** The import, deduplication, refresh/reauthentication retrieval, and invalid-input handling tests **passed**. Full end-to-end Sprint 2 R06 completion and instructor-awarded points remain **unverified**.
