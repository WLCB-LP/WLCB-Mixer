#!/usr/bin/env bash
set -euo pipefail
BRANCH="${1:-main}"
MSG="${2:-Update}"
git status
git add -A
git commit -m "$MSG"
git push origin "$BRANCH"
