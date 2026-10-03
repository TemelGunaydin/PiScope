# Security policy

PiScope is early software. Security fixes target the latest code on the
default branch; older versions do not have a separate maintenance commitment.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** button when private
reporting is available. Include affected versions, expected and actual behavior,
and a minimal reproduction using synthetic data. Do not send real credentials,
pairing links, private source code, or personal event journals.

If private reporting is not enabled, open an issue that only asks the maintainer
for a private reporting channel. Do not post vulnerability details or an exploit
publicly while arranging that channel. No response-time guarantee is offered.

## Trust boundaries

- The collector binds only to IPv4 loopback. Optional private HTTPS viewing
  through Tailscale Serve requires an explicitly configured, exact `.ts.net`
  origin. No wildcard hosts or automatic proxy-header trust are used. Event
  ingestion and Pi control polling stay local. Serve permits authenticated
  viewing/export and, only with separate opt-in, approved prompt submission.
  See [Tailscale setup](docs/TAILSCALE.md) and [control boundaries](docs/CONTROL.md).
- Tailscale is an additional network boundary, not per-user authorization.
  A paired browser can read all retained projects. Restrict tailnet access with
  grants/ACLs; never use Funnel. General-purpose reverse proxies, public hosting
  and multiple untrusted users are not supported.
- The bearer token and pairing URL grant access to local records. Same-user
  OS processes may read the files; this is not an OS security sandbox.
- Safe-field projection and redaction reduce collected information, but do
  not guarantee that prompt excerpts, file names, or reports contain no secrets.
- Default monitoring is read-only. Control additionally requires collector
  opt-in, a separate browser control token, and local `/dashboard-control on`
  in each target Pi runtime. A control-paired browser can submit prompts to
  **all opted-in sessions**, with their existing Pi/OS permissions and quota.
  This may edit files or execute commands; the project folder is not a sandbox.
  There is no per-project browser ACL and no automatic permission approval.
- Control login/writes require exact Origin and JSON content type. Separate
  host-only HttpOnly/SameSite=Strict control cookies are scoped to `/api/control`
  and Secure over HTTPS. Read pairing/bearer tokens alone cannot submit work.
- Commands are bounded, ephemeral, never journaled or replayed, and handed off
  at most once during a runtime. Unknown delivery is not retried. Queued prompts
  are not in exports; normal Pi history/capture applies after delivery.
  Disabling control does not abort work already running in Pi.
- Imported JUnit summaries are report observations, not signed runner evidence
  or proof that a specific commit passed tests.
- Event history, persistent project summaries, pending queues, quarantine files,
  and exports may be private.
  Keep them outside the repository and review anything you intend to share.

Maintainers should enable GitHub private vulnerability reporting before a
public launch. See the [release guide](docs/RELEASING.md).
