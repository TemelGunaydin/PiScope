#!/usr/bin/env bash
# Run explicitly on YOUR Mac. This creates a new PRIVATE repo; never overwrites one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v gh >/dev/null || { echo 'GitHub CLI is required. On Mac: brew install gh'; exit 1; }
gh auth status >/dev/null 2>&1 || { echo 'Authenticate first: gh auth login'; exit 1; }
OWNER="$(gh api user --jq .login)"
NAME="${1:-agent-workflow-dashboard}"
[[ "$NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Invalid repository name'; exit 1; }
[[ -d .git ]] || { echo 'Use the archive that includes .git, or clone the supplied Git bundle first.'; exit 1; }
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo 'Wrong git root'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Working tree has changes. Review and commit them before publishing.'; exit 1; }
if git remote get-url origin >/dev/null 2>&1; then echo 'An origin already exists. Inspect it before publishing; nothing changed.'; exit 1; fi
if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then echo "Repository already exists: $OWNER/$NAME. Nothing changed."; exit 1; fi
echo "Creating PRIVATE repository $OWNER/$NAME with the existing local commits."
gh repo create "$OWNER/$NAME" --private --source="$ROOT" --remote=origin --push
