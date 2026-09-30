# Project memory

**Projelerim** is the dashboard's starting view. It answers “what was I working
on?” using recorded Pi events, without model calls or a new task runner.

Each project has one card with its last work time, latest request excerpt,
latest visible response excerpt, and first unfinished reported stage. Cards
are ordered by last work time. Search covers the saved name, request, response,
and next step. A status filter includes projects untouched for at least seven
days. **Kayıtlı özeti oku** expands the saved text; **Son isteğe git** opens the
source request if it is still retained. The sidebar also lists recent sessions.

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
| Çalışıyor | At least one retained session has an observed request start, an unfinished current run, and a Pi signal less than 30 seconds old. |
| İptal | The latest request was cancelled. |
| İlgilenilmeli | The latest request failed, or its reported plan contains an error/blocked stage. |
| Bekleyen iş | The latest reported plan contains an unfinished stage, with no fresh active session. |
| Son istek bitti | The latest request technically completed, with no reported unfinished stage. The project is not declared complete. |
| Sonuç bilinmiyor | No sufficient result or unfinished plan is available. Missing data never proves completion. |

Active work takes precedence; otherwise the table is evaluated from cancellation
downwards. Pending, running, blocked, and error stages count as unfinished.
The displayed next step is the first such stage in plan order. It is an agent
report, not an inferred next action or manual “paused” setting. A cancelled
request can still show the plan it left behind.

The browser expires working badges without requiring a new SSE snapshot.
Restarted collectors do not treat historical sessions as currently connected.
Seven days of inactivity is a date filter, not an automatic cancellation or
completion rule. Models and providers do not affect project identity or status.

## Storage and recovery

`projects.json` lives in `AGENT_DASHBOARD_HOME` (by default
`~/.agent-workflow-dashboard/`) with private `0600` permissions. The file holds
at most **500 live and 500 demo projects**, independently. At a limit, the least
recently active project in that mode is removed and a storage warning appears.
This is a bounded memory, not a permanent all-time project counter.

Each entry keeps at most 600 characters of request text, 1,000 of response text,
20 stages with 160-character titles, identities, timestamps, and a technical
verdict. Common secret redaction is reapplied. Existing prompt-capture settings
are respected; omitted text cannot be recovered. No raw tool arguments, code,
hidden reasoning, or generated AI summaries are added.

Summaries are written through a private temporary file, `fsync`, and atomic
rename, at most once per 500 ms of active ingestion. They also flush at shutdown
and before journal rotation. A failed flush prevents rotation from discarding
recovery events. Per-project event checkpoints prevent replay from regressing
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
