# Private access with Tailscale Serve

The collector still binds only to `127.0.0.1`. Tailscale Serve terminates HTTPS
and forwards browser requests to that local server. Pi continues to send events
to the local URL; its extension and installation do not change.

This is opt-in, for your trusted devices on the same tailnet. It is not public
hosting or multi-user authorization. A paired browser can read/export all
retained projects. Keep the pairing link private and restrict device/user access
with your tailnet's grants/ACLs. **Use Serve, never Funnel.**

## 1. Find this Mac's Tailscale name

Install/sign in to Tailscale on both the Mac and the device you want to use.
In the dashboard directory:

```bash
tailscale status --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))'
tailscale serve status
```

Use the exact machine name shown, such as `my-mac.my-tailnet.ts.net`.
Check existing Serve routes before changing them; do not overwrite another app.

## 2. Start the dashboard with the allowed HTTPS origin

Stop the old dashboard with Ctrl+C, then:

```bash
AGENT_DASHBOARD_TAILSCALE_ORIGIN="https://my-mac.my-tailnet.ts.net" npm start
```

Keep this terminal open. The collector prints both its local pairing link and
its **Tailscale browser pairing** link. Neither link should be shared publicly.
The HTTPS origin must have no path, credentials, query or fragment.

The environment variable must be present on each dashboard start. Running plain
`npm start` without it returns to local-only access. It need not be set for Pi.

## 3. Enable private HTTPS forwarding

In a second terminal on the Mac:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:7331
tailscale serve status
```

Tailscale may ask you to enable HTTPS certificates for your tailnet. Follow its
setup link. The machine's certificate hostname can appear in public certificate
transparency logs, but **Serve does not make the dashboard publicly accessible**.
Access still depends on your tailnet policy and the dashboard's pairing token.

If port 443 is already serving another app, use a free Serve port instead, for
example `--https=8443` and origin `https://my-mac.my-tailnet.ts.net:8443`.
If you change `PORT`, update Serve's local target port too. Root-path serving is
supported; mounting under `/dashboard` is not.

## 4. Open from another device

With Tailscale connected on that device, open the **Tailscale browser pairing**
link printed by `npm start` in a new browser tab. The link's token fragment is
removed after login. The browser gets a host-only, HttpOnly, SameSite=Strict,
Secure cookie. Subsequent visits can use just the HTTPS address.

On the Mac, both commands are available:

```bash
npm run open                 # Existing local HTTP pairing
npm run open -- --tailscale   # Configured Tailscale HTTPS pairing
```

The two hostnames pair independently. `npm run open` cannot open the browser on
your phone; use the printed Tailscale link there. Keep the Mac awake and the
dashboard running. Background Serve remains configured until you disable it.

## Stop / troubleshoot

Stop this Serve endpoint only (do not reset unrelated routes):

```bash
tailscale serve --https=443 off
```

Use your selected HTTPS port if different. Restart the dashboard without
`AGENT_DASHBOARD_TAILSCALE_ORIGIN` to disable its remote-host allowlist.

- **Host rejected:** configured origin and actual Serve hostname/port must match.
- **Origin rejected:** use the same HTTPS origin for pairing and viewing; do not
  mix local and Tailscale URLs or put another proxy in front of Serve.
- **Pairing required:** local cookies do not pair the remote hostname. Open the
  private Tailscale link in a new tab, or reload it if pasted into an already-open
  unauthenticated dashboard tab.
- **502 / unreachable:** check `npm start`, Tailscale connection, HTTPS setup,
  Serve target port and tailnet grants/ACLs.
- **Remote event POST rejected:** intentional. Serve is for viewing; Pi event
  ingestion stays local. Forwarding headers cannot authorize extra hosts or
  bypass the local-only ingestion boundary.

## Validation

```bash
node --test test/tailscale.test.mjs test/server.test.mjs
# Python Playwright + Chromium + openssl required:
python test/browser-smoke.py --tailscale
```

The browser test uses a disposable **local HTTPS reverse proxy** with a test
certificate and simulated Serve headers, not your real Tailscale configuration.
It checks pairing, Secure cookies, reload and live SSE updates. Actual access
from a second tailnet device must still be checked on your network.

References: [Serve CLI](https://tailscale.com/kb/1242/tailscale-serve),
[Serve overview](https://tailscale.com/kb/1312/serve).
