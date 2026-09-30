# Security policy

Agent Desk is early software. Security fixes target the latest code on the
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

- The collector binds only to IPv4 loopback. It is not designed for public
  hosting, reverse proxies, remote sharing, or multiple untrusted users.
- The bearer token and pairing URL grant access to local records. Same-user
  OS processes may read the files; this is not an OS security sandbox.
- Safe-field projection and redaction reduce collected information, but do
  not guarantee that prompt excerpts, file names, or reports contain no secrets.
- The dashboard observes Pi; it does not enforce Pi's tool permissions.
- Imported JUnit summaries are report observations, not signed runner evidence
  or proof that a specific commit passed tests.
- Event history, persistent project summaries, pending queues, quarantine files,
  and exports may be private.
  Keep them outside the repository and review anything you intend to share.

Maintainers should enable GitHub private vulnerability reporting before a
public launch. See the [release guide](docs/RELEASING.md).
