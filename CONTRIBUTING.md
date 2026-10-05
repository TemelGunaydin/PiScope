# Contributing to PiScope

English and Turkish issues and pull requests are welcome. For a substantial
feature, describe the problem and a small proposed scope in an issue first.
Bug fixes and documentation improvements can go directly to a pull request.

## Local setup

Use Node.js 22+ and clone the repository. There is no dependency installation
or frontend build step:

```bash
npm run check
npm test
npm start
```

In another terminal, `npm run open` pairs the local browser. Never post the
private pairing URL in an issue or screenshot. Connect a real Pi project as
described in the README, or use the isolated browser tests below for synthetic
data. Demo records are hidden from the live UI. Core tests do not need Pi,
credentials, or an account.

## Tests

- Run `npm run check` and `npm test` for code changes.
- Run `npm run test:pi` for extension-loader or command changes when Pi is
  installed. It uses isolated directories and makes no model calls.
- For control changes, also run `npm run test:pi:control`,
  `python3 test/control-browser.py` and `python3 test/control-browser.py --tailscale`.
  Real Pi input is intercepted before model execution; browser tests use a mock
  Pi adapter. No personal project or Serve configuration is changed.
- For UI changes, install Python Playwright and Chromium in your own environment:

  ```bash
  python3 test/browser-smoke.py --network
  # Simulated Tailscale Serve HTTPS proxy; also requires openssl:
  python3 test/browser-smoke.py --tailscale
  python3 test/daily-browser.py
  python3 test/daily-browser.py --tailscale
  ```

  Tests start their own disposable collector and use synthetic records, not
  your personal history or Tailscale routes. Set `BROWSER_EXECUTABLE` to a
  Chromium-compatible browser executable if needed. `--network` exercises
  real HTTP/SSE; separate regression pages use fixture replay. `--tailscale`
  simulates HTTPS termination, not real device-to-device tailnet access.

Use targeted regressions for behavior changes. Keep generated screenshots
and test data out of the commit unless an intentional documentation artifact
needs updating. State which checks you ran and any unavailable checks.

## Design boundaries

- Preserve read-only defaults. Prompt control must require collector/session/
  browser opt-in and an explicit confirmation, without hidden model calls,
  spawned Pi processes, model switching or permission bypass. Check duplicate,
  stale, busy, offline, revocation and uncertain-delivery paths.
- Treat agent reports, imported reports, and observed execution as separate
  sources. Missing data is unknown, not success or zero cost.
- Keep live and demo data separate. Keep historical identities stable when
  profiles or models change.
- Project safe fields and redact before persistence or display. Never add raw
  tool arguments, credentials, reasoning, or source code to event records.
- Keep queues, payloads, retained state, and parser work bounded. Test recovery
  and duplicate delivery when changing persistence.
- Keep the UI in English, light, minimal, and readable: 18 px body text and
  at least 16 px visible supporting text. Preserve user content in its original
  language, keyboard controls and narrow-screen layout.
- Avoid adding runtime dependencies unless the benefit justifies shipping
  them in the standalone Pi extension as well as the collector.

## Pull requests

Use a focused branch. Describe the user-visible change, why it is needed, and
how it was checked. Include sanitized screenshots for visible UI changes.
Use Conventional Commit subjects, for example `fix: preserve pending events`.
Do not include personal journals, connection files, secrets, or real prompts.

By submitting a contribution, you agree to license it under this project's
[MIT license](LICENSE). Contribute only material you have the right to share.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of a public
issue. Community interactions follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
