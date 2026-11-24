#!/usr/bin/env bash
# Releases the Mac app at macos/VERSION as a GitHub release, with Terminal-1.dmg attached.
#   scripts/release.sh             dry run (default): builds the DMG and prints what --publish would do. Creates and changes nothing.
#   scripts/release.sh --publish   creates release v<version>, then writes public/releases.json for the website. Commit and deploy that file.
# Refuses when the git tree is dirty or the tag v<version> exists. --publish also refuses unless:
#   - DEVELOPER_ID and NOTARY_PROFILE are set, so the DMG is signed and notarized (see macos/build.sh); --allow-unsigned overrides that for a beta
#   - LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_PRODUCT_IDS are set, so the app refuses other stores' license keys
#   - the release repo is public (RELEASE_REPO=owner/name picks it), because buyers download the DMG without a GitHub login
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "release: $*" >&2; exit 1; }

publish=0
unsigned=0
for arg in "$@"; do
  case "$arg" in
    --publish) publish=1 ;;
    --allow-unsigned) unsigned=1 ;;
    *) echo "usage: scripts/release.sh [--publish] [--allow-unsigned]" >&2; exit 2 ;;
  esac
done
signed=1
[[ -n "${DEVELOPER_ID:-}" && -n "${NOTARY_PROFILE:-}" ]] || signed=0

VERSION="$(tr -d '[:space:]' < macos/VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "macos/VERSION must be x.y.z, got '$VERSION'"
TAG="v$VERSION"
DMG=macos/build/Terminal-1.dmg

dirty="$(git status --porcelain)"
[[ -z "$dirty" ]] || die "the git tree is dirty; commit or stash first:"$'\n'"$dirty"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then die "tag $TAG already exists; bump macos/VERSION"; fi
if remote_tag="$(git ls-remote --tags origin "refs/tags/$TAG" 2>&1)"; then
  [[ -z "$remote_tag" ]] || die "tag $TAG already exists on origin; bump macos/VERSION"
elif (( publish )); then
  die "could not ask origin whether $TAG exists: $remote_tag"
else
  echo "warning: could not ask origin whether $TAG exists: $remote_tag" >&2
fi

# owner/repo for the download link: RELEASE_REPO, else read from the origin URL as configured (not insteadOf-expanded).
REPO="${RELEASE_REPO:-$(git config --get remote.origin.url | sed -E 's#^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)##; s#\.git$##')}" || true
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "cannot read owner/repo from the origin remote; set RELEASE_REPO=owner/name"

if (( publish )); then
  (( signed || unsigned )) || die "--publish needs DEVELOPER_ID and NOTARY_PROFILE so the DMG is signed and notarized; for a beta, pass --allow-unsigned"
  [[ -n "${LEMONSQUEEZY_STORE_ID:-}" && -n "${LEMONSQUEEZY_PRODUCT_IDS:-}" ]] || die "--publish needs LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_PRODUCT_IDS: without them the app would accept any store's license key"
  command -v gh >/dev/null || die "--publish needs the gh CLI"
  gh auth status >/dev/null 2>&1 || die "--publish needs gh logged in: gh auth login"
  visibility="$(gh repo view "$REPO" --json visibility -q .visibility)" || die "could not read $REPO from GitHub; check RELEASE_REPO and that gh can see it"
  [[ "$visibility" == "PUBLIC" ]] || die "$REPO is $visibility: buyers cannot download from it. Set RELEASE_REPO to a public repo (owner/name)"
  git fetch -q origin || die "git fetch origin failed"
  [[ -n "$(git branch -r --contains HEAD)" ]] || die "HEAD is not on origin; push first so the tag points at the commit that was built"
fi

if (( ! signed )); then
  echo "warning: this build will not be signed and notarized (DEVELOPER_ID and NOTARY_PROFILE): macOS asks buyers to right-click > Open; --publish refuses it without --allow-unsigned" >&2
fi
if [[ -z "${LEMONSQUEEZY_STORE_ID:-}" || -z "${LEMONSQUEEZY_PRODUCT_IDS:-}" ]]; then
  echo "warning: LEMONSQUEEZY_STORE_ID or LEMONSQUEEZY_PRODUCT_IDS is unset: this app would accept any store's license key; --publish refuses it" >&2
fi
bash macos/build.sh
[[ -f "$DMG" ]] || die "macos/build.sh did not produce $DMG"
SHA="$(shasum -a 256 "$DMG" | cut -d' ' -f1)"
[[ "$SHA" =~ ^[0-9a-f]{64}$ ]] || die "could not hash $DMG"

prev="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
changes="$(git log --no-merges --format='- %s' -n 15 ${prev:+"$prev..HEAD"} -- macos bin hooks)"
[[ -n "$changes" ]] || changes="- No changes since $prev."

NOTES="$(mktemp)"
trap 'rm -f "$NOTES"' EXIT
{
  echo "Terminal 1 $VERSION for macOS 13.3 or newer."
  echo
  echo "Open Terminal-1.dmg and drag Terminal 1 to Applications."
  echo "Upgrading from the old Coworker app? Quit it and delete it from Applications; settings and permissions start fresh."
  if (( ! signed )); then
    echo "This beta is not signed and notarized: right-click Terminal 1 in Applications, choose Open, then Open again."
  fi
  echo
  echo "Changes"
  echo "$changes"
  echo
  echo "SHA-256 of Terminal-1.dmg: $SHA"
} > "$NOTES"

URL="https://github.com/$REPO/releases/download/$TAG/Terminal-1.dmg"
RELEASES="$(VERSION="$VERSION" URL="$URL" SHA="$SHA" CHANGES="$changes" node -e '
  const e = process.env;
  process.stdout.write(JSON.stringify({ latest: e.VERSION, url: e.URL, sha256: e.SHA, minimumSystemVersion: "13.3", notes: e.CHANGES }, null, 2) + "\n");
')"
[[ -n "$RELEASES" ]] || die "could not build the releases.json content"

release=(gh release create "$TAG" "$DMG#Terminal-1.dmg" --target "$(git rev-parse HEAD)" --title "Terminal 1 $VERSION" --notes-file "$NOTES")

if (( ! publish )); then
  echo
  echo "Dry run: nothing was published. $DMG is built (sha256 $SHA)."
  echo "--publish would run:"
  printf '  '; printf '%q ' "${release[@]}"; echo
  echo "with these notes:"; sed 's/^/  | /' "$NOTES"
  echo "and write public/releases.json:"; sed 's/^/  | /' <<<"$RELEASES"
  exit 0
fi

"${release[@]}" || die "gh release create failed; nothing was written to public/releases.json"
printf '%s\n' "$RELEASES" > public/releases.json
echo "released $(gh release view "$TAG" --json url --jq .url)"
echo "wrote public/releases.json for $TAG: commit it and deploy the site so /api/version and the download link serve it"
