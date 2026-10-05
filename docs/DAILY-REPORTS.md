# Daily work reports

**Daily report** collects captured work from all live projects for a chosen day.
It is a read-only view: no additional model call, control pairing or task
submission. Project names appear on the left, requests and outcomes on the
right; narrow screens stack them vertically.

## Reading and sharing

- The initial date is **Today** in the displayed report timezone. Use the
  date picker, **Previous**, **Next** and **Today** to browse other days. Today
  advances at midnight even without new events; a manually selected date stays put.
- Projects use stable name order; requests use first observed work time with
  stable identity tie-breaks. Separate sessions in one project are grouped.
- **Reported outcomes** are up to five short, optional
  `workflow_report.accomplishments` supplied by the agent. They describe
  reported changes, not independently verified achievements.
- Without those items, **Recorded response excerpt** shows the captured reply.
  It may be a plan, a partial answer or a report of success; PiScope does not
  reinterpret it as completed work. Long text has **Show more**.
- **Response finished** is technical completion under the existing execution
  rules, not proof the feature works or tests pass. **Error**, **Cancelled**
  and **Ongoing / outcome unknown** remain distinct. Provider details appear
  separately when recorded; child/tool failures may have no provider message.
- **Open request** opens retained monitoring details. **Back to daily report**
  restores the selected day and reading position. Saved excerpts remain when
  those details have expired, without a misleading live link.
- **Copy report** copies the chosen day's projects, prompts, reported outcome
  lists or response excerpts, and errors as text. Review private content before sharing. Clipboard support
  requires a compatible browser and secure context (localhost or HTTPS).
  Original-language text is preserved and HTML-like replies render as text.
- Unchanged request text, text selection, focus, expanded replies and native
  response disclosures are preserved across other projects' live updates.

## Sources, dates and retention

Reports come from existing captured Pi events. There is no Git scan, disk scan,
automatic summary generation or claim that all work on your computer is known.
Connections, heartbeats, model selection and imported test metadata alone do
not invent work for a new day. Demo records are excluded from the report view.

The collector's timezone is saved on first report creation and reused across
restarts, including after changing the machine timezone. The report labels
this zone; a phone in another timezone still sees the same work days.
Original event timestamps, not arrival time, determine the day. A request that
spans midnight can appear on both days with that day's captured work: its
prompt provides context, but response excerpts and accomplishments are never
borrowed from another day. Outcomes reflect the last retained state observed
for that day, not a guaranteed end-of-day audit.

`daily-reports.json` lives in the existing private data directory. It retains
at most **1,000 daily/request records and 12 MiB per live/demo mode**, independent
of detailed session retention. Each record stores bounded/redacted project
text, a prompt excerpt (600 characters), reply/provider-error excerpts (1,000
each), up to five 240-character accomplishment strings, identity, timestamps
and technical outcome. It never stores thinking, raw provider objects or
source-file contents. The snapshot/export includes `dailyReport` under the
existing authenticated viewing boundary; the private file is not a public
asset. As elsewhere, redaction is best effort, not complete secret detection.

Atomic private writes, replay checkpoints and flushing before journal rotation
preserve excerpts across ordinary restarts/detail eviction. Power-loss/filesystem
survival is not guaranteed. An unreadable file
is quarantined, not silently deleted; retained journal events rebuild what is
available. Write failure holds rotation until storage recovers. Very old,
uncaptured or already-expired work cannot be reconstructed. Empty days mean
**no retained captured work**, not “you did nothing.” There is no retention
promise for a fixed number of days.

## Activate after updating

1. Restart PiScope with your existing control/Tailscale environment settings,
   then refresh the browser. No tokens or Serve routes need changing.
2. Existing recorded replies populate reports from retained events; project
   extension updates are not needed for this fallback.
3. For future brief accomplishment lists, from the PiScope directory run:

   ```bash
   npm run install:pi -- "/absolute/path/to/project" --update
   ```

   Restart Pi in that project: `/reload` alone may retain imported modules.
   Re-enable `/dashboard-control on` only if you were using control. Do not
   interrupt active work just to upgrade. No `AGENTS.md`, model or workflow
   configuration change is required; the updated tool has optional fields and
   reporting guidance. The agent may still omit those fields.

When `AGENT_DASHBOARD_CAPTURE_PROMPTS=0`, the extension omits accomplishment
strings as well as private prompt/reply content and provider-echoed details.
Generic monitoring notices may remain. This is not a retroactive purge of
previously captured data. Existing latest-project summaries and history files
are preserved. See [project retention](PROJECTS.md), [control](CONTROL.md) and
[verification scope](VERIFICATION.md).
