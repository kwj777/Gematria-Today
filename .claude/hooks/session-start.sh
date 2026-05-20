#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install --no-audit --no-fund

# Verify playwright can launch the pre-installed chromium browser
# (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers is set by the environment).
# If this fails, the playwright version may have drifted from the
# pre-installed browsers; pin a matching version in package.json.
node -e "require('playwright').chromium.launch({headless:true}).then(b=>b.close())"
