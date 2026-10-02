# Preparing a public release

The project is distributed as source. `package.json` deliberately keeps
`private: true` to prevent accidental npm publication; it does not prevent an
open-source GitHub repository. No npm package or hosted dashboard is required.

## Local preparation

1. Review the diff and Git history, including authorship metadata and assets.
   Exclude private prompts, credentials, connection files, journals, exports,
   project summaries, and pending queues. `.gitignore` does not remove files already tracked.
2. Confirm [LICENSE](../LICENSE), [README](../README.md),
   [Turkish guide](../README.tr.md), and [CHANGELOG](../CHANGELOG.md) match the
   intended release. The README screenshot uses synthetic test data. Historical
   cover artwork is documented in [prompt and provenance](ARTWORK.md).
3. Run `npm run check`, `npm test`, and `git diff --check`.
   For extension changes run `npm run test:pi`; for UI changes run the optional
   browser check described in [CONTRIBUTING.md](../CONTRIBUTING.md).
4. Commit reviewed changes. Keep the working tree clean before publishing.

## Create a review repository

The existing helper deliberately creates a **private** repository first. It
requires `gh` authentication and refuses an existing origin, conflicting repo
name, or dirty working tree:

```bash
bash scripts/publish-github.sh
```

This command creates and pushes to `PiScope` under the
authenticated account. An optional first argument changes the repository name.
Run it only when creation and upload are intended; release preparation alone
does not run it. If an origin already exists, inspect and use the existing
repository instead.

## Public launch

1. Check the repository identity with `gh repo view` and review the uploaded
   tree, history, generated images, and CI logs. Confirm the CI matrix passes;
   local macOS results do not establish Linux or other Node-version results.
2. In GitHub settings, configure the intended maintainer access and branch
   protection/rules. Do not publish a pairing URL or run the collector on
   GitHub Pages; it is a local application.
3. When the reviewed repository is ready, change its visibility intentionally
   from its checked-out directory:

   ```bash
   gh repo edit --visibility public --accept-visibility-change-consequences
   ```

4. Before announcing, enable private vulnerability reporting under the
   repository's security settings and verify that **Report a vulnerability**
   is available. [GitHub's setup instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
   Enable secret scanning/push protection where available.
5. Add an accurate repository description and topics, such as `pi`, `agents`,
   `workflow`, and `observability`. The cover can be used as a social preview.
6. After checks pass, create a version tag and release with supported versions,
   known limitations, and a link to the verification record. Keep version,
   release notes, and compatibility claims aligned.

## CI maintenance

The core workflow runs on Linux and macOS with Node 22, 24, and 26. It does not
install Pi, request model credentials, or call a model. Pi and browser smoke
checks are separate, optional checks and must not be represented as hosted CI
coverage unless added and actually run.

Actions are pinned to full commit SHAs with `contents: read` permissions and
checkout credential persistence disabled. Dependabot proposes action updates;
review them before merging. This follows GitHub's [secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions).
