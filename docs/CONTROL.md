# Approved Pi continuation

[Generate report](DAILY-REPORTS.md) reuses these same three opt-ins and handoff
for one explicitly reviewed all-project daily summarization request. Only the
selected execution session needs runtime opt-in; retained context from other
tracked projects is included even when their Pi sessions are closed. It uses the current
Pi model and quota, without automatic calls, model changes or a new provider API.
The reporting tool returns a bound structured summary; a normal chat reply or
input-delivery receipt alone does not complete report generation.

PiScope is **view-only by default**. Optional control sends a plain user prompt
to an existing, explicitly opted-in Pi session. It does not spawn Pi, select a
model, call a provider directly, launch a subagent itself or bypass Pi's tools
and permissions. Work can modify files, run commands and consume your existing
model quota. The project's working folder is **not an OS sandbox**.

## Enable three separate permissions

### 1. Opt the collector in

Stop the existing PiScope terminal with Ctrl+C. For local control:

```bash
AGENT_DASHBOARD_CONTROL=1 npm start
```

For phone access, use your exact machine hostname as well:

```bash
AGENT_DASHBOARD_CONTROL=1 \
AGENT_DASHBOARD_TAILSCALE_ORIGIN="https://my-computer.my-tailnet.ts.net:8443" npm start
```

An existing Serve route to `127.0.0.1:7331` can stay unchanged. This does not
replace another app's route or make anything public. Keep using **Serve, not
Funnel**. [Tailscale setup](TAILSCALE.md).

The server prints a **separate Control pairing** link. Its token can start Pi
work; never share it publicly or commit it. The previous viewing token does
**not** grant control. The new `control.token` file is private (0600) in the
existing dashboard data directory.

### 2. Opt each Pi session in locally

From the PiScope directory, update only the monitoring extension in the project:

```bash
npm run install:pi -- "/absolute/path/to/project" --update
```

In that project's Pi session:

```text
/reload
/dashboard-control on
/dashboard-status
```

This permission is **per open Pi runtime**. Reloading, switching sessions, navigating the session tree or
closing Pi disables it; use `/dashboard-control on` again in the intended
session. An idle reloaded session can adopt its retained latest request when
its dashboard identity matches. No process is launched to resume closed sessions.
If the same saved session is open in two Pi processes, only one can own its
control lease. Do not enable both. Control requires `sendUserMessage`, `isIdle`
and `hasPendingMessages` APIs; installed-Pi integration was checked with **Pi 1.0.0**.

### 3. Pair the browser for control

On the Mac:

```bash
npm run open -- --control
# Or the configured HTTPS hostname:
npm run open -- --tailscale --control
```

On the iPhone, open the terminal's **Control pairing** link in a **new Safari
tab**. It contains `#control-token=...`, which is removed after login. This
pairs both viewing and control for that browser. Then use the plain HTTPS
bookmark. Opening the Mac browser does not pair the phone.

HTTPS cookies are host-only, HttpOnly, SameSite=Strict and Secure. The control
cookie is limited to `/api/control`; every browser write also requires the
exact allowed Origin and JSON content type. The local viewing cookie remains
separate. Restrict Tailscale access to trusted devices and people.

## Recommended and Other

Open a project's **last request**. The **Continue this project** panel shows
**Last model response** for the selected request, updating from reported Pi
text as it arrives. Long responses scroll without taking over the form;
unrelated live updates preserve reading position, selection and unsent drafts. This is the
recorded excerpt, not a guarantee of task completion or test quality.

When Pi reports a model/provider error (for example, Codex overload), the
project card shows the message and, when no request is active, an **Error**
badge. Active projects retain **Running**. This panel shows a separate error
alert. A new attempt or successful reply clears the current
warning; historical error events stay in the activity feed. PiScope does not
automatically retry or change models. Pi's own retry settings still apply.
Error details are bounded/redacted and omitted when prompt capture is disabled.
Older records without error details can show a generic error notice only.
Update the project extension and restart the Pi runtime for error capture;
`/reload` alone may keep old imported modules in some runtimes. Re-enable
`/dashboard-control on` after restarting. Restart the collector for updated
error projection; browser-only response display changes need just a refresh.

The panel offers:

- **Recommended:** up to five agent-reported suggestions. Choose **Review and
  start**, inspect the exact prompt and target project/session/model, then
  **Confirm and send to Pi**. Recommendations never run automatically.
- **Other:** write your own prompt (up to 8,000 characters), choose **Review
  prompt**, then confirm. **Cancel** leaves work unstarted.

Suggestions come from `workflow_report.recommendations`, not guesses based on
Finished or Needs attention. The tool's guidance asks the model to report
suggestions at the end of a request; abrupt failures may have none. Use Other
when no recommendation is reported. Reported suggestions are not quality proof.

Example final report:

```json
{
  "stages": [{"id": "implement", "title": "Implement the change", "status": "done"}],
  "recommendations": [
    {"id": "test", "title": "Run the relevant tests", "prompt": "Run the tests for this change and report any failures. Do not change unrelated code."},
    {"id": "review", "title": "Review the changes", "prompt": "Review the current diff for concrete regressions and ask before making further changes."}
  ]
}
```

Each suggestion has a stable ID, title (240 characters) and self-contained
prompt (4,000 characters). Send an empty list when none remain. Prompts are
projected and redacted like other reported text; prompt capture disabled in Pi
also omits recommendations. The browser shows the projected text it will send,
and the server rejects a recommendation changed after its preview.

Only the **current request in an open, idle and settled Pi session** can accept
work. Busy, disconnected, expired, older and demo targets are blocked. Pi checks
identity, branch, reviewed model and pending messages again after polling,
immediately before calling `sendUserMessage`. No steering, follow-up queue or prompt-template/
slash-command expansion is requested. Terminal permission dialogs can still
require your attention; the dashboard does not auto-approve them.

## Model-bound approval

Every new submission (Recommended, Other, linked note or daily report) carries
`expectedModel`, the exact observed provider/model name shown at review. The
runtime advertises its current model; collector validation requires it to match
the monitoring signal and approved model, both before queueing and at claim time.
Pi rechecks its actual current model after the network wait, before sending input.
The model is never switched by PiScope. Same request IDs cannot change models.

A model change invalidates the visible review instead of silently retargeting
it. Other text/note draft identity survives; review again for the new model.
Focus in a closed review moves to its status message. If you already confirmed
and delivery was uncertain, check Pi and its receipt; invalidation does not prove
an earlier request was unsent and never causes an automatic retry.

Missing model binding, unknown/unsafe model names and outdated runtimes fail
closed for **all new control submissions**, not just linked notes/reports.
Update the selected project's extension from PiScope with
`npm run install:pi -- "/absolute/path/to/selected-project" --update`, restart Pi,
and explicitly re-enable `/dashboard-control on`. Monitoring remains available;
PiScope does not install updates or change permissions automatically. These
handoff checks do not pin a model for an entire later run or sandbox Pi: a user
or another extension may change it after input acceptance; observed execution
remains the evidence of what actually ran.

## Receipts and uncertain delivery

Requests carry an idempotency ID and reserve their target run. Double clicks
and retries cannot start the same request twice during the collector's lifetime.
The collector claims a prompt once; it never re-delivers a claimed command.
Pi also deduplicates received IDs for its opted-in runtime.

- **queued:** accepted; waiting for Pi, not proof of execution.
- **claimed:** handed off once; awaiting a receipt.
- **submitted:** sent to Pi's input. Actual model execution appears separately
  in the observed Pi events; extensions may handle input without a model turn.
- **rejected / expired:** not accepted by Pi, or not collected within 15 seconds.
- **unknown:** delivery was uncertain. **Check Pi before sending a new request.**
  No automatic retry occurs.

Commands and receipts are bounded to 100 retained requests, kept only in memory,
with receipts expiring after ten minutes. Pi pauses at 100 received IDs per
opt-in lifetime; use `/dashboard-control off`, then `on` to reset that bounded
cache. Queued prompt text is not journaled
or included in snapshots/exports; it is removed when claimed or expired. Once
Pi accepts it, normal Pi history and configured monitoring capture apply.
Collector restarts lose pending commands; they do **not** execute them later.
This is an at-most-once handoff within a runtime, not a distributed exactly-once
or guaranteed-delivery system.

## Revoke access

In a Pi session:

```text
/dashboard-control off
```

Or restart PiScope **without** `AGENT_DASHBOARD_CONTROL=1` to disable all browser
writes. These steps do not abort a task already running in Pi. Stop that task
in Pi itself if needed. To invalidate previous control pairings, stop PiScope,
remove only the private `control.token` file, then restart with opt-in and pair
trusted browsers again. Do not delete history or the viewing token by mistake.
