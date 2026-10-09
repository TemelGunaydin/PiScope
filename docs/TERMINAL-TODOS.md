# Terminal Todos → approved project prompts

An optional, read-only bridge to [Terminal Todos](https://github.com/TemelGunaydin/terminal-todos).
Terminal Todos remains the source of truth. PiScope does not run its CLI, create
its lock file, import legacy data, migrate it, or edit/delete/complete tasks.

## Enable on the collector machine

From PiScope's directory, restart the collector with:

```bash
AGENT_DASHBOARD_TODOS=1 npm start
```

Keep your existing `AGENT_DASHBOARD_CONTROL=1` and exact
`AGENT_DASHBOARD_TAILSCALE_ORIGIN` settings if already used. No Serve route or Pi
permission needs changing just to read notes. Refresh the browser after updating.
No Terminal Todos source is read unless the integration is explicitly enabled.

The path matches Terminal Todos: an **absolute** `XDG_DATA_HOME` selects
`$XDG_DATA_HOME/terminal-todos/todos.json`; otherwise an absolute `HOME` selects
`$HOME/.local/share/terminal-todos/todos.json`. Relative XDG/HOME values are not
used. An optional absolute `AGENT_DASHBOARD_TODOS_FILE` overrides the file path;
it does not enable the bridge by itself. There is no folder discovery, legacy
`~/.swift_todos.json` import, binary download or source-file creation.

## Link, edit, review, send

1. Open **Project notes**, or a project's **Project notes** button.
2. Expand **Link Terminal Todos project labels**. Select the exact PiScope
   project and press **Save link**. A label is a name, not a directory identity:
   **nothing matches by name automatically**, including identical names. Pickers
   show project IDs; same-name project cards show IDs next to their captured
   context. Compare these before linking; leave a label unlinked if unsure.
3. Optionally select **Edit prompt** on a note. Its inline **Prompt draft**
   starts with the displayed note; add instructions before it or edit the copy.
   The source note remains unchanged. **Cancel edit** discards only this local
   draft and restores the original-note flow. Empty drafts cannot be used.
4. Choose the target and press **Use as prompt**. A saved link sets only its
   default target; the note's picker can explicitly override it without changing
   the link. Unassigned/unlinked notes need a one-time target. Missing historical
   targets are never replaced by similarly named projects. PiScope opens one
   existing, ready session in **that project only** and copies the edited draft
   (or displayed note if not editing) into **Other**. You can edit further there.
   Copying is not submitting; later source changes never replace either draft.
5. Press **Review prompt**, check the project ID, Pi session, current model and
   exact edited text, then **Confirm and send to Pi**. Cancel sends nothing.

Open notes are the default; **Completed notes** and **All notes** show source
completion metadata, not independently verified work. Notes stay in ID order.
Source updates are read about every two seconds; unchanged reading, selected
text, target choices and drafts survive unrelated live updates. Inline drafts
also survive filters and navigation within the page; they are not saved to disk,
sent to the collector while editing, or restored after a browser reload. Editing
alone needs no send grant and uses no model quota.

Reading uses no model quota. Sending requires all [three control opt-ins](CONTROL.md):
collector control, a separately control-paired browser, and local runtime
`/dashboard-control on`. Saving links requires collector/browser control, but
starts no model work and grants no runtime permission. Busy, stale, offline or
unapproved targets fail closed. No Pi session is spawned, busy work queued,
execution interrupted, model switched, or uncertain delivery automatically retried.

The ordinary approved-input path is reused: `sendUserMessage` with prompt-template
expansion disabled, existing model/quota/tools/permissions, exact project/session/run
checks and at-most-once handoff. It is **not a sandbox**. Sent is not completed:
source tasks remain unchanged even after a model reply or delivery receipt.

Unlike a [daily report](DAILY-REPORTS.md), a todo prompt is **not all-project scope**.
Only the selected note's edited text goes to the confirmed project/session. Other
notes are not bundled. Imported notes are not daily work evidence or automatically
added to report context; a confirmed Pi request can subsequently be captured as
ordinary work by the monitoring extension.

## Privacy, storage and limits

- Notes/labels are rendered literally with best-effort secret redaction. Preview
  what will leave the machine for your existing Pi provider before confirming.
- Imported note text stays in memory, not in PiScope's journal or new note database;
  it is excluded from **Export history**. Approved prompts can be recorded by Pi
  and normal prompt capture, subject to its existing settings.
- Only label hashes → project-ID links are saved in PiScope's private `0600`
  `todo-links.json`. Source titles, label text and paths are not stored there.
  The configured source must not alias that writable link file.
- Versions **1 and 2** are supported, with validated fields, unique positive safe
  integer IDs below `next_id`, completion booleans and valid timestamps. Version 1
  has no project labels. Rust u64 values beyond JavaScript's safe integer range
  are refused rather than rounded. Unknown fields/versions are refused.
- Limits: **512 KiB source JSON**, **1,000 tasks**, **64,000 UTF-16 characters per
  note**, **240 per label**, **1,000 saved links**. Source reads require a regular
  file and reject final-file symlinks on supported Unix platforms. Nothing is
  silently trimmed to the send limit: a draft over **8,000 characters** must be
  edited down before review.
- Missing, malformed, unreadable or oversized data shows a warning. A last-read
  snapshot may remain visible, explicitly marked stale, but cannot seed a fresh
  draft or save a link until the source is available again. A damaged link file
  is preserved and cannot be overwritten with guessed defaults.

Phone access uses the existing private Tailscale Serve route and separate browser
pairing. This slice does not add phone note creation, two-way editing/sync,
automatic completion, per-todo execution tracking or autonomous task scheduling.
