<img src="public/icon.png" width="88" height="88" alt="PiScope icon">

# PiScope

**Your Pi projects, at a glance — anywhere.**

A local-first workflow dashboard **for [Pi coding agent](https://pi.dev) users**.
See what your projects are doing, which agents are working, and where you left
off — without switching between terminal tabs. With optional **Tailscale Serve**,
check the same dashboard from your phone while away from home.

English · [Turkish setup guide](README.tr.md)

![PiScope workflow dashboard with synthetic test data](docs/preview.png)

*The screenshot uses synthetic data, not real prompts or measured model performance.*

PiScope is a companion to Pi, not another coding agent. It **observes** your
existing sessions: it does not call models, choose providers, delegate tasks,
write code or run tests. No additional model subscription or API key is needed.
The dashboard UI is in English; your project names, prompts and responses stay
in their original language.

## What you can follow

- **All your monitored Pi projects:** one card per project, even across several sessions.
- **Recent context:** last request, last response, last work time and reported plan step.
- **Live work:** main model, subagent calls, tools, handoffs and activity feed.
- **Unfinished work:** distinguish running, waiting, blocked and unknown outcomes.
- **Workflow comparisons:** profile versions, observed models, duration and reported tokens.
- **Test reports:** explicitly attached JUnit summaries, separate from execution status.
- **Persistent history:** short project summaries survive dashboard restarts.
- **Phone access:** private HTTPS viewing over Tailscale, including outside your home Wi-Fi.

Cards stay in project-name order instead of jumping around during live updates.
Use search and status filters, **Open last request**, and **Back to projects** to
move between the overview and details. Long saved text expands with **Show more**.

**“Last request finished” does not mean the entire project is complete or tests
passed.** Plan steps are agent reports, not proof of execution. Missing outcomes
remain unknown; missing usage is not zero, and tokens are not a cost estimate.

## 1. Run PiScope locally

You need **Node.js 22+**, a browser, and an existing Pi installation for live
monitoring. There are **no npm runtime dependencies**, no `npm install` step,
and no frontend build.

```bash
git clone https://github.com/TemelGunaydin/PiScope.git
cd PiScope
npm start
```

Keep this terminal running. In a **second terminal**, from the PiScope directory:

```bash
npm run open
```

This opens the browser with a private pairing link. You can also open the link
printed by `npm start`. After pairing, use **http://127.0.0.1:7331** on the same
machine. `npm start` starts the server; `npm run open` only opens and pairs your
browser. It does not start the server.

> Treat pairing links as passwords. Do not post them in issues, screenshots or
> public chats. PiScope is a local application, not a GitHub Pages website.

macOS has been exercised locally; core CI is configured for Linux and macOS.
Windows is not currently validated. Live model/subagent compatibility was
checked with Pi **0.87.1** and pi-open-agents **0.1.22**. Other subagent packages
may need an adapter; model identities are not tied to a specific provider.

## 2. Add your Pi projects

There is no manual “Add project” form and no disk scan. **Install the monitoring
extension into each project, then work in Pi as usual.** Python, Swift, Node.js
and other projects can be monitored — the target does not need `package.json`.

### Install from the PiScope directory

```bash
# Run these in PiScope, NOT in the projects you want to monitor.
npm run install:pi -- "/absolute/path/to/project-one"
npm run install:pi -- "/absolute/path/to/project-two"
```

The installer copies `.pi/extensions/agent-dashboard/` into each selected
project. It does not change your models, API keys, MCP settings or agent
configurations. Use only one copy per Pi session: avoid installing the same
extension both globally and locally.

### Open Pi in the target project

```bash
cd /absolute/path/to/project-one
pi
```

In Pi:

```text
/reload
/dashboard-status
```

You should see **`PiScope: connected`**. Give Pi a normal task; the project will
appear in PiScope when its work is recorded. Repeat for other projects. If you
already have a Pi session open in the project, `/reload` is enough to load the
new extension. `/dashboard-status` checks delivery — it does not start a task.

### Optional: show the agent's plan

Model and tool events are monitored automatically. Stage lists and next steps
require your agent to use the extension's **`workflow_report`** tool. To append
optional reporting instructions to the project's `AGENTS.md`:

```bash
npm run install:pi -- "/absolute/path/to/project" --update --instructions
```

`--update` replaces only this extension and backs up the previous copy.
`--instructions` preserves existing instructions and backs them up before
appending guidance. Omit it if you do not want to change `AGENTS.md`. If your
orchestrator limits available tools, allow `workflow_report` in its existing
configuration. This tool reports a plan; it does not run or delegate the work.

### Update or remove a project installation

After pulling updates to PiScope:

```bash
npm run install:pi -- "/absolute/path/to/project" --update
```

Then `/reload` in that project's Pi session. To uninstall, remove only
`.pi/extensions/agent-dashboard/` and reload Pi. Recorded history is kept.
Web-only changes need just a browser refresh, not an extension reinstall.
Existing data and installs retain their original `agent-dashboard` paths and
`AGENT_DASHBOARD_*` settings for compatibility with earlier versions.

## 3. Follow progress from your phone with Tailscale

**Away from home?** Leave Pi working on your computer and check its projects,
agent activity and latest responses from your phone over mobile data or another
Wi-Fi network. No public server or router port forwarding is needed.

Install [Tailscale](https://tailscale.com) on the computer running PiScope and on
your phone. Sign both into the same tailnet and keep Tailscale connected. The
computer must stay **awake, online, with PiScope running**; live progress also
requires the Pi session to keep running. Remote viewing does not control Pi or
submit new tasks.

### Find your computer's Tailscale name

On the computer:

```bash
tailscale status --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))'
tailscale serve status
```

Replace `my-computer.my-tailnet.ts.net` below with your machine's exact name.
The name belongs to the **computer**, not the project. Different apps need
separate HTTPS ports. This example uses **8443** so an existing app on **443**
can stay untouched; check that 8443 is free too.

### Start PiScope with its HTTPS origin

Stop the existing dashboard with `Ctrl+C`, then run from the PiScope directory:

```bash
AGENT_DASHBOARD_TAILSCALE_ORIGIN="https://my-computer.my-tailnet.ts.net:8443" npm start
```

In another terminal, enable the private proxy:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:7331
tailscale serve status
```

Tailscale may ask you to enable HTTPS for your tailnet; follow its setup link.
**Use Serve, not Funnel.** Serve is private to your tailnet; Funnel is public.

### Pair the phone's browser

Open the **Tailscale browser pairing** link printed by `npm start` in a **new tab
on your phone**. Keep the token private. After pairing, bookmark the plain URL:

```text
https://my-computer.my-tailnet.ts.net:8443/
```

The same HTTPS URL works on the computer too:

```bash
npm run open -- --tailscale  # Opens and pairs this computer's browser only
npm run open                # Local access still works
```

You do **not** need to run `npm run open` before every phone visit. Pair once per
browser, then use the bookmark while the server is running. Local and HTTPS
hostnames pair independently. The HTTPS origin setting is required on each
PiScope start; plain `npm start` without it enables local-only access.

To disable only PiScope's Serve endpoint:

```bash
tailscale serve --https=8443 off
```

Do not reset all Serve routes or overwrite another app's port. PiScope still
listens on loopback: `http://100.x.y.z:7331` is **not** a supported access URL.
If you change `PORT`, update Serve's backend target too.

A paired browser can read/export **all** retained projects. Restrict access to
trusted devices/users through your tailnet grants/ACLs. Pi ingestion remains
local. See [full Tailscale setup and troubleshooting](docs/TAILSCALE.md).

## Workflow profiles and test reports

To compare workflow versions, add `.pi/agent-dashboard.workflow.json` to a
monitored project. Start with [the example](examples/workflow-profile.json),
using your actual agent names. Profiles label workflows; they do not choose
models. New requests capture their own profile and observed model identities.
Use the same `taskSet` for comparable workloads; that label is not proof of
identical inputs. [Detailed workflow guide](docs/WORKFLOWS.md) (Turkish).

After a request finishes, before starting another, attach a project-local JUnit
report from that request in the same Pi session:

```text
/dashboard-evidence reports/junit.xml
```

PiScope reads the report; it does not run tests. Old, invalid or out-of-project
reports are rejected. Empty or entirely skipped reports are inconclusive.
An imported report is not independent proof of current code quality or test
execution. [Supported formats and trust boundaries](docs/EVIDENCE.md) (Turkish).

## Data and privacy

- Records stay on the Pi machine in `~/.agent-workflow-dashboard/` (the retained
  compatibility path). No cloud telemetry, external frontend CDN or model calls.
- Set `AGENT_DASHBOARD_HOME` in **both Pi and PiScope** to change the data directory.
  Keep it outside the repository. Do not commit records or pairing information.
- If the server is offline, Pi persists accepted events and retries delivery.
  Default queue limits: **5,000 pending events / 20 MiB per client**. New events
  are rejected at capacity; accepted history is kept. Check `/dashboard-status`.
- The journal rotates and detailed history is bounded. Short project summaries
  survive longer (up to **500 live projects**, separately from hidden demo data).
  Exports contain retained state, not an unlimited archive. Deleting journals
  alone does not erase project summaries. [Project memory](docs/PROJECTS.md).
- Prompt/response excerpts can contain private information. Secret redaction is
  not complete data-loss prevention. To omit prompt, task and response text:

  ```bash
  AGENT_DASHBOARD_CAPTURE_PROMPTS=0 pi --continue
  ```

  File names, model identities and reported stages may still be recorded.
- Same-user OS processes can read local records. Tailscale is an extra network
  boundary, not per-project or multi-user authorization. Review exports before
  sharing, and keep pairing links, queues and `connection.json` private.

## Development and contributing

```bash
npm run check
npm test
# Optional installed-Pi integration check (no model calls):
npm run test:pi
```

Core tests need no Pi installation, credentials or paid models. Optional browser
checks use a disposable collector, synthetic data and no personal history:

```bash
# Requires Python Playwright + Chromium; --tailscale also requires openssl.
python test/browser-smoke.py --network
python test/browser-smoke.py --tailscale
```

The Tailscale test simulates an HTTPS proxy; real phone access must still be
verified on your tailnet. macOS checks do not establish every OS/Pi/provider
combination. [Verification history](docs/VERIFICATION.md).

Bug reports and focused contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md),
[Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## License

[MIT](LICENSE). PiScope is an independent community project, not an official
product of Pi, Tailscale, OpenAI or any model provider. Pi and pi-open-agents
are separate projects; mentioning them does not imply endorsement.
