#!/usr/bin/env bash
# publish — release the @icjia/pdf-search-index monorepo packages to npm
#
# THE release path for this repo: merge your feature work into main, then run
# `./publish.sh <bump>` from a clean main checkout. The script bumps versions
# in lockstep across all three packages, commits, tags, pushes, and publishes.
# No Release PR — main is the release branch.
#
# (.github/workflows/release.yml + changesets exist in this repo, but the
# preferred workflow is this script. Use changesets only if you specifically
# want the Release-PR pattern.)
#
# Usage:
#   ./publish.sh              # patch bump across all three packages (default)
#   ./publish.sh patch        # same as above
#   ./publish.sh minor        # minor bump
#   ./publish.sh major        # major bump
#   ./publish.sh first        # publish all three at their current package.json versions
#
# 2FA OTP:
#   Set NPM_OTP env var or you'll be prompted. One code works for all three
#   publishes if they fire within the npm ~5-minute window.
#
# Examples:
#   ./publish.sh first
#   NPM_OTP=123456 ./publish.sh patch
#   ./publish.sh minor

set -euo pipefail

BUMP="${1:-patch}"

PACKAGES=(
    "@icjia/pdf-search-index"
    "@icjia/astro-pdf-search-index"
    "@icjia/nuxt-pdf-search-index"
)

PACKAGE_DIRS=(
    "packages/core"
    "packages/astro-pdf-search-index"
    "packages/nuxt-pdf-search-index"
)

# ─── Preflight checks ───────────────────────────────────────────────────

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo "Refusing to publish: not on main (currently on $BRANCH)" >&2
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing to publish: working tree not clean" >&2
    git status --short >&2
    exit 1
fi

git fetch origin main 2>/dev/null || true
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "$LOCAL")
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "Refusing to publish: local main is not in sync with origin/main" >&2
    exit 1
fi

if ! npm whoami >/dev/null 2>&1; then
    echo "Not logged in to npm. Run: npm login" >&2
    exit 1
fi

# ─── Test + build before any version changes ────────────────────────────

echo "==> Running tests"
pnpm test

# ─── Compute new version ────────────────────────────────────────────────

CURRENT=$(node -p "require('./packages/core/package.json').version")

if [ "$BUMP" = "first" ]; then
    VERSION="$CURRENT"
    echo "==> First-time publish at v$VERSION (no version bump)"
else
    VERSION=$(node -e "
const v = '$CURRENT';
const bump = '$BUMP';
const [maj, min, pat] = v.split('.').map(Number);
const next =
  bump === 'major' ? \`\${maj + 1}.0.0\` :
  bump === 'minor' ? \`\${maj}.\${min + 1}.0\` :
  bump === 'patch' ? \`\${maj}.\${min}.\${pat + 1}\` :
  (() => { throw new Error('Unknown bump: ' + bump); })();
console.log(next);
")
    echo "==> Bumping all three packages: $CURRENT → $VERSION"

    for dir in "${PACKAGE_DIRS[@]}"; do
        node -e "
const fs = require('fs');
const p = './$dir/package.json';
const o = JSON.parse(fs.readFileSync(p, 'utf-8'));
o.version = '$VERSION';
fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
"
    done

    # Refresh the lockfile in case anything resolves differently with the new
    # versions. Internal workspace deps use `workspace:*` so usually no-op.
    pnpm install --no-frozen-lockfile >/dev/null
fi

# ─── Build with new version in package.json ────────────────────────────

echo "==> Running build"
pnpm build

# ─── Commit version bump (skip for `first`) ────────────────────────────

if [ "$BUMP" != "first" ]; then
    git add packages/*/package.json pnpm-lock.yaml
    git commit -m "chore: release v$VERSION"
fi

# ─── Tag per-package + repo-wide ───────────────────────────────────────
# Order: tag BEFORE publish so the invariant "if it's on npm, it's tagged
# in git" holds. If publish fails, tags are recoverable.

echo "==> Tagging v$VERSION"
for pkg in "${PACKAGES[@]}"; do
    TAG="${pkg}@${VERSION}"
    if git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null; then
        if [ "$(git rev-list -n 1 "$TAG")" != "$(git rev-parse HEAD)" ]; then
            echo "Refusing to publish: tag $TAG exists but does not point at HEAD" >&2
            exit 1
        fi
        echo "    $TAG already at HEAD; reusing"
    else
        git tag "$TAG"
    fi
done

if git rev-parse --verify --quiet "refs/tags/v$VERSION" >/dev/null; then
    if [ "$(git rev-list -n 1 "v$VERSION")" != "$(git rev-parse HEAD)" ]; then
        echo "Refusing to publish: tag v$VERSION exists but does not point at HEAD" >&2
        exit 1
    fi
    echo "    v$VERSION already at HEAD; reusing"
else
    git tag "v$VERSION"
fi

# ─── Push commit + tags BEFORE publish ─────────────────────────────────

echo "==> Pushing main + tags"
git push origin main
for pkg in "${PACKAGES[@]}"; do
    git push origin "${pkg}@${VERSION}"
done
git push origin "v$VERSION"

# ─── npm publish each package ──────────────────────────────────────────

if [ -z "${NPM_OTP:-}" ]; then
    read -p "Enter npm 2FA OTP (leave empty if not required): " NPM_OTP
fi

OTP_FLAG=""
if [ -n "${NPM_OTP:-}" ]; then
    OTP_FLAG="--otp=$NPM_OTP"
fi

for pkg in "${PACKAGES[@]}"; do
    echo "==> Publishing $pkg@$VERSION"
    pnpm --filter "$pkg" publish --access public --no-git-checks $OTP_FLAG
done

# ─── Done ──────────────────────────────────────────────────────────────

echo
echo "==> Done. v$VERSION shipped."
for pkg in "${PACKAGES[@]}"; do
    echo "    npm: https://www.npmjs.com/package/$pkg"
done
echo "    GitHub: https://github.com/ICJIA/pdf-search-index/releases/tag/v$VERSION"
