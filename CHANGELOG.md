# Changelog

## Unreleased

Initial open-source release preparation. No hosted release is implied by this
entry; the application version remains `0.1.0`.

- Read-only Daily report with date navigation, project-grouped accomplishments
  or recorded reply excerpts, honest error/cancelled/unknown outcomes, Copy report,
  responsive layout and preserved reading under unrelated live updates. Bounded
  private daily excerpts survive detail expiry and ordinary collector restarts;
  optional workflow reports add short accomplishments without extra model calls.
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
