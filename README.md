<img src="public/icon.png" width="88" height="88" alt="PiScope icon">

# PiScope

**See what your Pi projects are doing and pick up where you left off.**

PiScope is a dashboard for people who use the [Pi coding agent](https://pi.dev).
It brings your projects, latest requests, model responses and agent activity into
one browser window. You can also check it from your phone with Tailscale.

English · [Türkçe rehber](README.tr.md)

![PiScope showing a sample Pi workflow](docs/preview.png)

*This screenshot uses synthetic test data. It contains no real user prompts or measured model performance.*

You keep working in Pi as usual. PiScope records what Pi reports and shows it in
the dashboard. Viewing your projects does not make model calls. Sending a new
request or generating a daily report is optional and requires your confirmation;
those actions use your existing Pi model, permissions and quota.

## What can I do with it?

| What you want to do | Where to go |
|---|---|
| See where you left off | **Projects** shows each project's last request, response and reported next step. |
| Find what needs a response | **Needs attention** gathers unread replies, current errors and reported blockers. |
| Find earlier work | **Search history** searches saved prompts and responses, with project, model, result and date filters. |
| Keep important projects nearby | Use **Pin** and switch between **Cards** and **Compact list**. These choices stay in this browser. |
| Return to a specific request | Open it and use **Copy request link**. Refresh and browser Back/Forward keep navigation working. |
| Read or reuse a model response | Responses support Markdown, tables and code blocks with **Copy code**. |
| Summarize your day | **Daily report** creates one approved summary across tracked projects. |
| Continue work from the dashboard | **Continue this project** lets you review a suggestion or write your own next request. |
| Use your existing task notes | **Project notes** can read Terminal Todos notes and help turn one into a reviewed Pi request. |

A **request** is a task you send to Pi. A **session** is an open Pi conversation.
Several sessions in the same project share one project card.

**A finished response does not mean the whole project is complete or its tests
passed.** Plans come from agent reports. Missing results stay unknown.

## Get started

You need **Node.js 22 or later**, a browser and an existing Pi installation.
There is no `npm install` or frontend build step.

### 1. Start PiScope

```bash
git clone https://github.com/TemelGunaydin/PiScope.git
cd PiScope
npm start
```

Keep this terminal open. In a **second terminal**, open the PiScope folder and run:

```bash
npm run open
```

This opens and pairs your browser with the running dashboard. Pairing means
allowing that browser to read your local PiScope data. You can also open the
private pairing link printed by `npm start`.

After pairing, visit [http://127.0.0.1:7331](http://127.0.0.1:7331).
`npm run open` only opens the browser; `npm start` must still be running.
Treat pairing links like passwords and keep them private.

### 2. Connect a project

From the **PiScope folder**, run this once for each project you want to follow.
Replace the example path with the project's full folder path:

```bash
npm run install:pi -- "/absolute/path/to/your/project"
```

The installer adds the monitoring extension under
`.pi/extensions/agent-dashboard/` in that project. Your project can use any
language; it does not need `package.json`. Use one extension copy per Pi session,
not both a global and a project-local copy.

### 3. Open Pi and do some work

In another terminal, open your project:

```bash
cd /absolute/path/to/your/project
pi
```

Inside Pi, run:

```text
/reload
/dashboard-status
```

Look for **`PiScope: connected`**, then give Pi a normal task. The project appears
in the dashboard when PiScope records its work. Repeat steps 2 and 3 for other
projects. If Pi does not recognize the commands, restart Pi in that project.

## Everyday use

- Start on **Projects**. Open a project's latest request to see its response,
  models, tools and activity. Use **Back to projects** to return to your filters.
- Open **Needs attention** to find unread replies and current issues. Opening the
  exact reply clears its unread label. Reading an error does not resolve it.
- Use **Search history** for earlier requests. For example, search for `login`,
  select a project, and narrow the date range. Dates use the timezone shown on
  screen. Only retained text is searchable, up to 30 requests per session;
  expired or uncaptured text cannot be recovered.
- Use **Copy request link** to bookmark a request. The link contains no pairing
  password, so another browser must pair separately. Expired links show an
  unavailable message instead of opening a different request.
- Use **Pin** for frequent projects and **Compact list** to fit more projects on
  screen. Pinned projects appear first; names keep a stable order during updates.
- Read responses with Markdown formatting and **Copy code**. Raw HTML remains
  text and remote images do not load automatically.

Unread markers, pins and layout choices belong to this browser. Your phone and
computer can have different choices. The dashboard interface is English; your
project names, prompts and responses keep their original language.

Project cards may show a reported next step. To enable plan reporting, see
[project memory and workflow reporting](docs/PROJECTS.md) and
[workflow profiles](docs/WORKFLOWS.md). Model and tool activity is recorded without
requiring a reported plan.

## Optional: send your next task from the dashboard

Enable this only if you want to send work to an existing, idle Pi session.
Three separate permissions are required:

1. Restart PiScope with control enabled. Keep any Tailscale or notes settings you already use:

   ```bash
   AGENT_DASHBOARD_CONTROL=1 npm start
   ```

2. Update the target project's extension from the PiScope folder:

   ```bash
   npm run install:pi -- "/absolute/path/to/your/project" --update
   ```

   Restart Pi in that project, finish a normal request, then run
   `/dashboard-control on` in Pi.

3. Open the **Control pairing** link printed by PiScope in the browser you want
   to use. The ordinary viewing link does not grant permission to send work.

Open the project's latest request. Under **Continue this project**, select a
**Recommended** suggestion or write your request in **Other**. Review the exact
text, target project, session and current model, then choose **Confirm and send
to Pi**. Nothing is sent until you confirm.

The request uses Pi's existing tools and permissions, so it can change files,
run commands and consume model quota. PiScope does not start closed Pi sessions
or interrupt busy ones. A **Sent** receipt means delivery, not task completion.
Use `/dashboard-control off` in Pi to stop accepting new dashboard requests.

[Control setup and troubleshooting](docs/CONTROL.md)

## Optional: create a daily work report

After enabling the three control permissions above:

1. Open **Daily report** and choose a date.
2. Choose one ready Pi session to write the report.
3. Select **Generate report**, review the included context, and confirm.
4. Read the summary and **Remaining / blocked** section, then use **Copy report** if needed.

The selected session supplies the model. The report covers captured work across
all tracked projects for that day, including projects whose Pi sessions are now
closed. It sends **one approved model request** for the day and uses that model's
existing quota. The report is an AI summary, not an independent test result.

If generation is unavailable, the panel explains the missing setup. Older
extensions need an update and a Pi restart to support report generation.

[Daily report guide](docs/DAILY-REPORTS.md)

## Optional: use Terminal Todos notes

If you already use [Terminal Todos](https://github.com/TemelGunaydin/terminal-todos),
you can read its notes in **Project notes**. Enable the integration when starting
PiScope, keeping any existing control and Tailscale settings:

```bash
AGENT_DASHBOARD_TODOS=1 npm start
```

Choose the correct PiScope project for a note. You can edit a local prompt copy,
then use **Use as prompt** to prepare it in **Other**. Sending still requires the
control permissions and final confirmation described above. Reading notes needs
no model call; sending a request uses your existing Pi model and quota.

PiScope never changes or completes the original note. Saved project-label links
require browser control permission. The default notes file is
`~/.local/share/terminal-todos/todos.json`, or the equivalent location under an
absolute `XDG_DATA_HOME`. Set an absolute `AGENT_DASHBOARD_TODOS_FILE` if you use
another location.

[Terminal Todos setup, linking and result tracking](docs/TERMINAL-TODOS.md)

## Optional: check progress from your phone

Install Tailscale on your computer and phone, sign both into the same private
network, and use **Tailscale Serve** to reach PiScope over HTTPS. Your computer
must stay awake, online and running PiScope; live work also needs Pi to stay open.

Follow the [phone setup guide](docs/TAILSCALE.md) for the exact hostname, free
HTTPS port and pairing steps. Open the printed **Tailscale browser pairing**
link on your phone once, then bookmark the plain HTTPS address. Sending work
from the phone also needs separate Control pairing in that phone's browser.

**Use Serve, not Funnel.** Funnel would expose the endpoint publicly. Do not
replace another application's existing Serve route.

## Update PiScope

From the PiScope folder:

```bash
git pull
```

Restart PiScope with the same control, notes and Tailscale settings you were
using, then refresh your browser. When an update changes the Pi extension,
update it in each project that needs the change:

```bash
npm run install:pi -- "/absolute/path/to/your/project" --update
```

Restart Pi in that project and re-enable `/dashboard-control on` if you use it.
A browser-only update does not require reinstalling the Pi extension. To remove
the extension, delete only `.pi/extensions/agent-dashboard/` from that project
and restart Pi. Recorded history is kept.

## Something not working?

| What you see | What to check |
|---|---|
| The dashboard will not open | Keep `npm start` running, then run `npm run open` from another terminal in PiScope. |
| **Pairing required** | Open the private pairing link in this browser. Local and Tailscale addresses pair separately. |
| No project cards | Install the extension in your project, open Pi there and give it a task. There is no manual Add project form. |
| No reported next step | The agent has not reported a plan. Tool/model monitoring still works. |
| Sending or report generation is disabled | Check the on-screen reason, the three control permissions and whether Pi is idle. Update older extensions if requested. |
| A saved request link is unavailable | Its exact history may have expired. Look for the project's saved summary under Projects. |

## Data and privacy

Records stay on the Pi computer in `~/.agent-workflow-dashboard/`. PiScope has
no cloud telemetry and needs no additional model API key or subscription.
Set `AGENT_DASHBOARD_HOME` in both Pi and PiScope to use another data folder;
keep that folder outside the repository.

Captured prompts, responses and errors can contain private information. To stop
capturing those texts in a Pi session:

```bash
AGENT_DASHBOARD_CAPTURE_PROMPTS=0 pi --continue
```

This also disables daily report generation in that session. It does not erase
previous records; file names, model names and reported stages may still appear.
Secret masking is best effort, so review exports and copied reports before sharing.

History is limited in size. Project summaries can outlive detailed events, and
**Export history** exports retained state, not an unlimited archive. An authorized
browser can read all retained projects. Keep pairing links and local records
private. [Storage limits](docs/PROJECTS.md) · [Security policy](SECURITY.md)

## Development and further reading

```bash
npm run check
npm test
```

Core tests need no Pi installation, credentials or paid model. For synthetic
browser checks, see [Contributing](CONTRIBUTING.md). Examples:

```bash
python3 test/browser-smoke.py --network
python3 test/workspace-browser.py
python3 test/workspace-browser.py --tailscale
```

Browser checks require Python Playwright and Chromium; HTTPS simulation also
requires OpenSSL. Optional installed-Pi checks are `npm run test:pi` and
`npm run test:pi:control`; they make no model calls.

macOS has been exercised locally; core CI is configured for Linux and macOS.
Windows has not been validated. See the [verification record](docs/VERIFICATION.md)
for tested Pi/extension versions and the distinction between simulated HTTPS
and real phone access.

- [Project history, navigation and Markdown](docs/PROJECTS.md)
- [Workflow comparisons](docs/WORKFLOWS.md) · [Imported JUnit reports](docs/EVIDENCE.md)
- [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md)

## License

[MIT](LICENSE). PiScope is an independent community project and is not an
official product of Pi, Tailscale, OpenAI or any model provider.
[Third-party notices](THIRD_PARTY_NOTICES.md) cover the locally included SpinKit
component and Marked parser.
