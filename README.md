# Agent Desk

**A local, model-independent workflow dashboard for Pi.**

English · [Türkçe](README.tr.md)

See the current task, subagents, workflow stages, and test reports in a simple
browser dashboard. Compare workflow versions as models change. Everything is
stored on the machine running Pi; the dashboard makes no model API calls.

![Agent Desk: a local workspace connecting agent tasks, progress, and reports](docs/agent-desk-cover.png)

*Original AI-generated project illustration. [Artwork notes](docs/ARTWORK.md).*

Agent Desk observes your existing workflow. It does not choose models, delegate
work, execute tests, or write code. The interface is currently in Turkish, with
a light theme and readable text sizes.

## Quick start

Requirements: **Node.js 22+**, a browser, and Pi for live monitoring. There are
no npm runtime dependencies and no frontend build step. Pi is not needed for
the demo or core tests. macOS has been exercised end to end; Linux core checks
are configured in CI. Windows is not currently validated.

Download or clone this repository, then run from its directory:

```bash
npm start
```

Open the private pairing URL printed in the terminal, or use another terminal:

```bash
npm run open
```

The server listens only on `127.0.0.1:7331`. Treat the pairing URL as a secret.
To explore without a model or Pi session:

```bash
npm run demo -- --fast
```

Select **Demo** in the dashboard. Synthetic events are separate from live data.

## Connect a Pi project

From the dashboard directory:

```bash
npm run install:pi -- "/absolute/path/to/your/project"
```

Then, inside Pi in that project:

```text
/reload
/dashboard-status
```

The installer copies only `.pi/extensions/agent-dashboard/`. It does not change
providers, credentials, model choices, MCP settings, or agent definitions.
Use `--instructions` to also append the optional workflow-reporting guidance to
`AGENTS.md`; existing instructions are preserved and backed up. Install the
extension once per Pi session, not both globally and in the project.

Live compatibility has been checked with Pi **0.87.1** and pi-open-agents
**0.1.22**. Other subagent packages may require their own adapter. Model names
are data, not hardcoded workflow identities.

To update a project copy after pulling changes:

```bash
npm run install:pi -- "/absolute/path/to/your/project" --update
```

Then use `/reload`. To uninstall, remove that project's extension directory
and reload Pi. Removing the extension does not delete recorded history.

## What it tracks

- Pi session, prompt, model, tool, and subagent events.
- Planned stages through `workflow_report`: pending, running, done, error,
  blocked, or cancelled. A reported plan is separate from observed execution.
- Technical completion, unresolved work, durations, and reported token use.
- Workflow profiles by version, task set, role, and observed model identities.
- Explicitly imported JUnit results, grouped by test identities.
- A durable offline queue with ordered recovery within each producer.

<details>
<summary>View the dashboard (simulated demo data)</summary>

![Agent Desk with simulated demo data](docs/preview.png)

The screenshot contains demo events, not measured model performance.

</details>

It does not infer task quality, model rankings, or monetary cost. Incomplete
runs and missing measurements are not counted as success or zero usage.

### Compare workflows

Add `.pi/agent-dashboard.workflow.json` to the monitored project:

```json
{
  "schemaVersion": 1,
  "id": "implement-review",
  "version": "1",
  "label": "Implementation and review",
  "taskSet": "regressions-v1",
  "roles": [
    { "role": "implementation", "agent": "builder" },
    { "role": "review", "agent": "reviewer" }
  ]
}
```

Use your actual Pi agent names. The profile does not select models. It is read
for each new request, and past requests retain their own profile and model
history. Use the same `taskSet` for comparable workloads; change the workflow
version when its behavior changes. The task-set label is a user assertion,
not proof of equal inputs. See the [workflow guide](docs/WORKFLOWS.md) (Turkish).

### Attach a test report

After a request finishes, before starting the next one, use the same Pi session:

```text
/dashboard-evidence reports/junit.xml
```

The command reads an explicitly selected, project-local UTF-8 JUnit report
created during or after that request. It does not execute tests. Reports are
limited to 2 MiB and 20 distinct files per request. Unsupported XML, stale
reports, inconsistent totals, and paths outside the project are rejected.
Empty or entirely skipped reports are inconclusive. Agent claims do not
produce test evidence.

Only counts, relative file metadata, and hashes are retained, not raw XML,
assertion messages, or test names. A report is not independent proof that a
runner executed against the current code. See [report semantics and supported
JUnit formats](docs/EVIDENCE.md) (Turkish).

## Local data and privacy

The default data directory is `~/.agent-workflow-dashboard/`. Set
`AGENT_DASHBOARD_HOME` in **both** the dashboard and Pi environments to change
it. Keep that directory outside the repository. Use `PORT=7441 npm start` to
change the listening port.

Accepted offline events are persisted before delivery, with a default limit
of 5,000 pending events / 20 MiB per client. At capacity, new events are rejected
and accepted history is kept. `/dashboard-status` shows queue and storage
errors. Recovery requires a running dashboard and an installed Pi extension;
old recovered events do not make a dead session appear live.

Delivered events use a rotating journal; the UI retains bounded history.
Export downloads the retained view, not an unlimited archive. Corrupt or
rejected queue records remain in `spool/quarantine/` for manual inspection.

Prompt and response excerpts can contain private data. Common secret patterns
are redacted, but this is not a complete data-loss prevention system. To omit
prompt, task, and response text, launch Pi with:

```bash
AGENT_DASHBOARD_CAPTURE_PROMPTS=0 pi --continue
```

File names, model identities, and stage reports may still be recorded. Never
share pairing URLs, `connection.json`, event journals, exports, or queue files
without reviewing them. Applications running as the same OS user can read
local data. There is no cloud telemetry or third-party frontend CDN.

## Development

```bash
npm run check
npm test
```

These commands need no credentials, installed Pi, or paid model access. Tests
use temporary directories and local HTTP servers. Optional installed-Pi check:

```bash
npm run test:pi
```

This also makes no model calls. Set `PI_BIN` if Pi is not on `PATH`. Browser
checks are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

CI is configured for Node 22, 24, and 26 on Linux and macOS. A workflow file is
not evidence of a successful hosted run; consult the repository's Actions tab
once published. See [verification history](docs/VERIFICATION.md) for checks
actually performed locally.

## Contributing

Bug reports, minimal reproductions, compatibility fixtures, and documentation
improvements are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).
Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), and use
[SECURITY.md](SECURITY.md) for vulnerability reporting.

[Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) ·
[Release guide](docs/RELEASING.md) · [Full Turkish guide](README.tr.md)

## License

[MIT](LICENSE). Pi and pi-open-agents are independent projects; their names do
not imply endorsement. Agent Desk is not an official product of Pi, OpenAI,
or any model provider.
