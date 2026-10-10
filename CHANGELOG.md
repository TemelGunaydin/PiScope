# Changelog

## Unreleased

Initial open-source release preparation. No hosted release is implied by this
entry; the application version remains `0.1.0`.

- Note cards retain the latest explicitly linked Pi request's Pending/Sent/Running/
  Reply ready/Error/Unknown state, bounded response/error and exact request link.
  A visible request-ID header and one observed input ticket prevent unrelated
  extension replies from borrowing the note's identity. No source completion,
  uncertain-delivery replay or extra model request.
- Every new control submission binds its reviewed provider/model. Model changes
  invalidate browser consent; collector and Pi reject mismatches before delivery,
  without switching models. Old extensions without model binding require an
  update/restart; monitoring remains available.
- Reject Terminal Todos sources aliasing collector-owned files before startup
  writes, including inode, hardlink and symlink/parent aliases.
- Submitted daily reports with no observed bound run become Unknown after the
  30-second observation window, without retry/replay or losing prior good output.
- Bound project-summary JSON bytes independently per live/demo mode; preserve
  valid legacy files and commit pruning only after successful atomic saves.
- Preserve unchanged project response selection and sidebar keyboard focus under
  unrelated SSE/heartbeats, with exact-ID navigation and stable ordering.
- Optional read-only Terminal Todos project notes: explicit label-to-project-ID links, unassigned one-time targets, local in-card Edit prompt drafts (including extra instructions), editable Other copies and existing single-project review/confirmation. No source writes, automatic completion, model switching or busy queuing; imports stay out of history exports and automatic daily-report context.
- Daily report with one Generate report button and one AI-generated overall-day
  report across all tracked projects, not per-project buttons or raw request/reply
  lists. Generate report uses an existing idle Pi session's current model through the three control opt-ins and exact preview/confirmation, with no
  provider integration, model switching, automatic requests or retries. Bounded
  project/record coverage, separate remaining work, cross-project stale-source and
  duplicate-pending-day protection, preserved good summaries on failure, private
  persistence and Copy report; generation uses Pi quota.
- Clear daily-report setup states beside Generate, a separate current-model
  display, automatic ready-session selection and retained explicit choices.
  Equal-height project cards within desktop rows, with bottom-aligned actions
  and unclipped expansion/larger text; natural-height mobile cards.
- Last model response inside Continue this project, with selection/scroll
  preserved under live updates. Bounded, redacted Pi provider errors appear
  in project Error badges, detail alerts and the activity feed; recovery clears
  current warnings without adding retries or model changes.
- Optional Recommended/Other continuation into existing idle Pi sessions,
  requiring separate collector/session/browser opt-ins and explicit confirmation.
  Exact-preview binding, duplicate/stale/busy/offline safeguards, ephemeral
  receipts, and no automatic replay or model/workflow changes.
- PiScope name and English UI, with Pi-specific onboarding and an updated screenshot.
- Original PiScope icon in the sidebar and READMEs, with favicon and Apple touch variants.
- Local, authenticated Pi workflow dashboard with a light, readable interface.
- Model-independent profiles and comparisons by version, task set, and role.
- Explicit execution outcomes, reported token use, and bounded retained history.
- Durable offline delivery, recovery, queue limits, and quarantine diagnostics.
- JUnit report import with safe summaries, file hashes, and separate test sets.
- Persistent project overview with grouped sessions, last-work dates, saved
  request/response excerpts, reported next steps, search, and status filters.
- Stable project/session ordering and return navigation preserving filters and focus.
- Opt-in Tailscale Serve HTTPS access for private phone monitoring, without remote ingestion.
- MIT license, English/Turkish entry guides, community documents, and CI.

See [verification history](docs/VERIFICATION.md) for checks actually performed
and their limits.
