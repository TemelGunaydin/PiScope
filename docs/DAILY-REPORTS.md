# AI-generated daily work report

**Daily report** has one **Generate report** button and one overall report for the
chosen day across all tracked projects. There are no per-project generation
buttons, requests or report cards. The LLM combines the day's captured work,
mentions project names where helpful and separates remaining/blocked work.

## Generate the whole day

1. Update the extension in the Pi session that will generate the report, from
   the PiScope directory:

   ```bash
   npm run install:pi -- "/absolute/path/to/project" --update
   ```

   Restart Pi; `/reload` may retain imported modules. Leave its current model,
   permissions and workflow configuration unchanged.
2. Restart PiScope with your existing Tailscale settings and
   `AGENT_DASHBOARD_CONTROL=1`. Pair the browser using its separate **Control
   pairing** link in a fresh tab; enable `/dashboard-control on` in the chosen
   Pi session. These are the same [three control permissions](CONTROL.md).
   Viewing pairing alone cannot generate reports.
3. Open **Daily report**, choose the date and click the single **Generate report**
   button. **Use the model from this Pi session** picks the execution session,
   not which projects are included. A suitable session is selected automatically;
   its current model and availability are shown separately. Your explicit choice
   is retained. Disconnected historical sessions are not offered as new targets. One eligible, opted-in,
   connected, idle, settled current session with `daily_report` and prompt capture
   enabled is enough. Other projects do **not** need open or control-enabled Pi
   sessions for their retained work to be summarized. Beside the button, a named
   readiness state explains browser pairing, local Pi control, extension/prompt
   capture requirements, busy sessions or missing captured context, with relevant
   setup steps. These instructions never enable permissions automatically.
4. Review the exact prompt, current model, included-project/record coverage and
   disclosure that context from all included projects is sent to that one Pi
   session. **Cancel** starts no work. **Confirm and generate in Pi** sends one
   normal model request, not a series of per-project requests. A source fingerprint
   and exact prompt are rechecked before sending; changes require a fresh preview.
5. The model calls `daily_report` once with the overall summary and optional
   remaining work. The typed output is published only after observed request and
   technical completion. A normal chat reply or input receipt is not a report.
   Failures, cancellations and missing typed output are shown honestly.

Generation consumes the existing model's quota. PiScope makes **no direct provider
API call**, requires **no new API key**, changes no model and spawns no Pi process.
It does not automatically generate or retry; Pi's own existing retry settings still
apply. A pending report for a day blocks a second submission even from a different
Pi session. Regenerating after completion replaces that day's overall report,
regardless of which eligible runtime is selected.

Pi keeps its existing permissions; this is **not a sandbox**. The prompt asks for
summarization only, no commands/edits/delegation, but a prompt is not an OS permission
boundary. The request appears in normal Pi history/monitoring in the chosen session.
Generation jobs are excluded from daily coding-work input to prevent reports from
summarizing themselves, and do not receive coding workflow-profile bindings.

## Reading and copying

The main output is one short overall account plus concrete outcome bullets, not
raw prompts/replies or a request-by-request log. **Remaining / blocked** is
separate. Repeated work is combined; plans, failed/cancelled attempts and uncertain
results must not become accomplishments. Text follows the recorded work's language;
UI labels are English. HTML-like output is literal text, not executable markup.
AI inference is not independent verification of code changes or passing tests.

Use **Previous**, **Next**, **Today** or the date picker. Today advances at saved-zone
midnight without new events; a manually chosen date stays fixed. Desktop and phones
use the same single-report layout. **Copy report** copies the overall generated
report, remaining work and coverage, not raw replies. Review private content before
sharing. Clipboard support requires localhost/HTTPS and a compatible browser.

Work recorded in any project, or a changed tracked-project inventory, marks the
report out of date; there is no silent regeneration. Failed regeneration retains
and labels the previous good report, including when copied. Status/stale notices
update without rebuilding unchanged summary text, preserving reading/selection.
No report means not generated, not “nothing was done.”

## Projects, dates and bounded context

“Tracked projects” means live projects known to persistent project memory or
retained daily records, not a filesystem scan or a manual configuration list.
All are considered, including closed/inactive projects. Only their **selected-day**
records are input: shortened prompts/replies, optional reported accomplishments,
outcomes and errors. A project with zero retained records is marked as no captured
work for that day; this is not proof of inactivity. Older replies or project-card
context are never borrowed into that day. Demo data and generation jobs are excluded.

Days use original event times and the saved collector timezone, including DST;
computer and phone share boundaries. No Git/disk scan, uncaptured computer activity
or expired-history reconstruction is performed. Midnight-spanning requests retain
only that day's available response/accomplishment context.

The single input stays within ordinary control's **8,000-character prompt limit**.
Project names and work excerpts are shortened; active projects are considered
first and recent records are sampled round-robin across projects. Included/total
project and record counts disclose omitted context when a large day cannot fit.
Zero total records and omitted excerpts are distinguished. The output is bounded
(2,400 summary and 800 remaining characters), so this is an overview, not a complete
audit or quality certificate.

## Persistence and privacy

Captured `daily-reports.json` retains its existing format and up to **1,000
day/request records and 12 MiB per live/demo mode**. Private `generated-reports.json`
stores one all-project report per day, with **500 entries and 2 MiB** total limits.
Previously generated per-project entries remain stored/exportable separately rather
than being erased or falsely merged into a new report; they share that file's
retention budget. The UI displays the new overall-day reports. Generated text/errors
are bounded and redacted; both files use private atomic writes, not public static assets.

Authenticated state/SSE/export includes captured records, tracked project names and
retained reports. Viewing access covers all retained projects, not per-project browser
ACLs. Thinking/raw provider objects are not captured. Redaction is best effort.
Source context from **all included projects** is sent to the selected Pi model/provider
only after approval, under that model's existing usage/data handling.

Restart never replays queued requests. Unfinished generation/delivery becomes uncertain;
a matching later result can still be recorded. Reports survive ordinary restart and
detail expiry within retention bounds. Unreadable files are preserved with an invalid-file
suffix; captured work remains available for explicit regeneration. Filesystem/power-loss
survival is not guaranteed. Deleting journals alone does not erase summary files.

`AGENT_DASHBOARD_CAPTURE_PROMPTS=0` disables generation capability and typed text emission;
it does not purge old captured/generated text. Installing does not modify personal
projects, control grants, tokens, models/workflows or existing Serve routes.
See [control setup](CONTROL.md), [project retention](PROJECTS.md),
[security](../SECURITY.md) and [verification scope](VERIFICATION.md).
