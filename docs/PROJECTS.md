# Project memory

**My projects** is PiScope's starting view. It answers “what was I working
on?” using recorded Pi events, without model calls or a new task runner.

Each project has one card with its last work time, latest request excerpt,
latest visible response excerpt, and first unfinished reported stage. Cards
are ordered with explicitly pinned projects first, then by project name within
each group (English locale, project ID as tie-breaker). Activity updates do not
move them. **Cards / Compact list** changes density without reducing text size;
**Pin / Unpin** changes only the project's placement. The layout and up to 500
full project IDs are stored in this browser's `piscope.projects.v1` local storage,
with a page-local fallback when storage is unavailable. No captured text is saved
in preferences. Search covers the saved name, request,
response, and next step. A status filter includes projects untouched for at
least seven days. Request and response text are shown directly on the card.
Only fields longer than 220 characters have **Show more** underneath;
it expands that field in place, without a duplicate summary. **Show less**
collapses it again. Each field keeps its expansion state across live updates.
Cards in the same desktop row share a height, with next-step/actions anchored at
the bottom. Expansion and larger text grow the row without clipping content;
mobile cards retain their natural height.
**Open last request** opens the source request if it is still retained. **← Back to projects** restores
the overview's filters, scroll position, and focus on the originating card when
it is still visible. Unrelated project updates retain unchanged card nodes,
including short/expanded text selection and keyboard focus. Relative-age ticks
update only the time label. A card whose own content/actions change may be rebuilt,
with its expansion/focus handling preserved; old selected text is not fabricated
for a changed response. The sidebar lists sessions by project name and session ID.
Its buttons are retained by full session ID across heartbeats and unrelated SSE;
name, request count and active styling update in place, without replacing the
focused button or resetting unchanged mobile sidebar scroll. Name-based reordering
restores focus on that same retained button; removing the focused session returns
focus to **Projects**, not another execution target. Duplicate names/short ID
prefixes never select a different session; a click opens that ID's latest snapshot.
Click the sidebar **Projects** button to expand/collapse a list of project names
underneath it. Each live recorded project appears once, in A–Z/full-ID order.
Only running projects show SpinKit's **Rotating Plane** at the row's right edge
(Running accessible text and tooltip): a green square flipping around the X/Y
axes at a calm 1.5-second cycle. There are no extra running-status labels or
invented progress percentages.
A reserved column keeps names stable. Only the scoped CSS component is vendored
locally, with [its pinned source and MIT notice](../THIRD_PARTY_NOTICES.md); no
CDN, JavaScript bundle or npm dependency. Reduced-motion keeps a static square,
and collapsed/inactive rows stop animating. It uses existing aggregate observed
status and disappears when no fresh running signal remains. Original
project cards and session rows are unchanged. Enter/Space work natively; Escape
closes the list and returns focus to Projects. Unchanged rows, focus and scroll
survive SSE. Duplicate names show full project IDs; selection opens the exact
latest retained request or reveals that project's saved card if archived.
The UI only shows live records; there is no Live/Demo selector.
**Projects** and [**Daily report**](DAILY-REPORTS.md) are separate navigation views;
project cards keep latest context, while daily reports use an explicitly approved
Pi model request to synthesize captured work across all tracked projects into one
overall-day report. Only one Generate report button and execution session are needed. Merely viewing either screen makes no model call.

## New replies

A small **New reply** label appears on project cards and in the Projects list
when the latest captured terminal main reply has not been opened in this browser.
Select the project under Projects to open that exact reply, even if a newer
request has started. Opening an older/different request does not clear it. An
already open, visible request reads its reply when it arrives; a hidden tab does
not. Saved completed summaries can be opened from Projects when details expired.

First visit starts quietly, without flagging old history. Read markers survive
reload in this browser/origin's `localStorage` (up to 500 full project/session/run
ID triples; no names, prompts, responses or credentials). Clearing browser data
resets the baseline; unavailable/corrupt storage falls back to page-local tracking.
Other browsers have independent state. This is one marker per project, not an
unlimited unread history or cross-device inbox. Expired/uncaptured replies are
not reconstructed. No settings, notification permissions, counts, model calls,
control writes or source-note completion. **New reply is not verified success.**

## Needs attention, history and request links

**Needs attention** groups exact request identities with unread main replies,
current saved request/provider errors, or blocked/error stages in the latest
reported project plan. An older unread reply remains separate from a newer
failure. Opening a reply clears only its unread reason, not its errors/blockers.
Historical errors from superseded requests are not permanent alerts. Viewing
saved summaries reveals that project's exact card, including in Compact list.
No notification permissions, execution or automatic retry are added.

**Search history** searches captured prompts, responses, error text and model
identities across all retained live sessions. Filters combine exact project ID,
observed model (including earlier main models and observed child models), result,
and inclusive date range in the displayed report timezone. Requested-only child
models and demo sessions are excluded. Results show 50 at a time. This is bounded
request history, up to 30 requests per session, not full transcript/journal search.
Search filters survive in-page navigation and browser history, including after
reloading a request. Filter values stay in browser session history, not the URL
or exported state.

Live history/attention cards are retained by the full project/session/request
identity. Changes to another request preserve open identity details, unchanged
text selection, keyboard focus and the visible reading position, including when
new rows appear above it. Same-card changes update only the changed fields.
Removed source text is not recreated as a selection; removing the focused card
returns focus to that view's heading instead of selecting another request.

Request URLs contain only view and full project/session/request IDs. **Copy request
link** uses the current origin and contains no pairing token or captured text;
another browser must pair independently. Navigation never dispatches Pi input.
Reload and browser Back/Forward resolve that exact request; missing, expired or
mismatched identities show an unavailable view instead of selecting another run.
Saved summaries remain available from Projects when detailed history has expired.

Captured responses support local Markdown in project cards, selected requests,
subagent results, daily reports and note response excerpts. Code blocks have a
language label, horizontal scrolling and exact **Copy code** action. Marked tokens
are rendered with DOM creation and text nodes, never interpreted response HTML.
HTML/images stay literal; relative/custom-protocol links are not navigable.
External HTTP(S)/mailto links require a click and open with `noopener noreferrer`.
Unchanged selected responses and project/note summaries keep their nodes,
selection and scroll position during SSE.

## Identity and scope

The existing Pi adapter hashes the project directory into `projectId`. Sessions
in the same directory share a card; different directories remain distinct even
when their names match. Moving a directory creates a different identity. The
full directory path is not added to the snapshot.

Only observed projects appear. There is no disk discovery, historical Pi
session import, or access to Codex/other applications' tabs. Upgrading builds
initial summaries from the journal still present; already expired history
cannot be reconstructed. Live and demo summaries have separate identities
and retention limits.

The summary follows the most recently started request across that project's
sessions. It is not a merged backlog of every old request. A late result from
an older request does not replace a newer task. Last work time uses the original
event time, including recovered offline events; connection events, heartbeats,
and monitor warnings do not refresh it.

## Status meanings

| Label | Meaning |
|---|---|
| Running | At least one retained session has an observed request start, an unfinished current run, and a Pi signal less than 30 seconds old. |
| Cancelled | The latest request was cancelled. |
| Needs attention | The latest request failed, or its reported plan contains an error/blocked stage. |
| Unfinished work | The latest reported plan contains an unfinished stage, with no fresh active session. |
| Last request finished | The latest request technically completed, with no reported unfinished stage. The project is not declared complete. |
| Outcome unknown | No sufficient result or unfinished plan is available. Missing data never proves completion. |

Active work takes precedence; otherwise the table is evaluated from cancellation
downwards. Pending, running, blocked, and error stages count as unfinished.
The displayed step is the first such stage in plan order. Its label distinguishes
**Plan: Step in progress** (running), **Plan: Next step** (pending),
**Plan: Blocked step** (blocked), and **Plan: Step with a reported error** (error).
This is an agent report, not proof of current execution, an inferred next action,
or a manual “paused” setting. A cancelled request can still show the plan it left behind.

The browser expires working badges without requiring a new SSE snapshot.
Restarted collectors do not treat historical sessions as currently connected.
Seven days of inactivity is a date filter, not an automatic cancellation or
completion rule. Models and providers do not affect project identity or status.

## Storage and recovery

`projects.json` lives in `AGENT_DASHBOARD_HOME` (by default
`~/.agent-workflow-dashboard/`) with private `0600` permissions. The file holds
at most **500 live and 500 demo projects**, independently. Encoded JSON records
also have a **32 MiB budget per mode**, including UTF-8 and JSON escaping. At a
count or byte limit, the most recently active summaries that fit are retained
and a storage warning appears. Demo pressure cannot evict live summaries. The
shared reader allows **64 MiB plus 1 KiB envelope allowance**, so saved files fit
its limit; valid schema-1 files above the former 32 MiB reader limit can still
load without being renamed or rewritten merely by opening them. This is bounded
memory, not a permanent all-time project counter.

Each entry keeps at most 600 characters of request text, 1,000 of response text,
20 stages with 160-character titles, identities, timestamps, and a technical
verdict. Common secret redaction is reapplied. Existing prompt-capture settings
are respected; omitted text cannot be recovered. No raw tool arguments, code,
or hidden reasoning are collected from tool payloads. Generated daily summaries
are stored separately; their ordinary Pi requests/replies remain visible in
normal monitoring.

Summaries are written through a private temporary file, `fsync`, and atomic
rename, at most once per 500 ms of active ingestion. They also flush at shutdown
and before journal rotation. A failed flush prevents rotation from discarding
recovery events; byte-budget pruning is committed only after the save succeeds,
not on a failed write. Per-project event checkpoints prevent replay from regressing
saved summaries and allow the unflushed journal tail to be recovered after a
process exit. Power-loss/filesystem durability is not guaranteed.

When detailed sessions expire, their summaries remain readable but the detail
button is removed. A partial request replay cannot silently clear a remembered
failed or unresolved child just because its older events are missing. A corrupt
summary file is preserved as `projects.json.invalid-*` and the retained journal
is used to rebuild what remains; a warning explains the loss of older summaries.

Authenticated state, SSE, and JSON export include `projectOverview`. Existing
execution totals and workflow comparisons still use retained detailed runs;
summary counts do not change their denominators. Summaries and any preserved
invalid files may contain private excerpts. They are excluded from Git and
should be reviewed before sharing. Removing event journals alone does not
erase project memory; removing memory alone lets retained events rebuild it.
