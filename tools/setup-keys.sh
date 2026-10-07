#!/bin/sh
# One-time creation of persistent owfeed package and release signing keys.
# Private halves are uploaded to this repository's GitHub Actions secrets;
# only public halves belong in git.
set -eu

REPO="${REPO:-Medvedolog/opera-proxy-wrt}"
OWFEED_VERSION="${OWFEED_VERSION:-v0.5.1}"
WORK="${WORK:-./keys-setup}"

command -v gh >/dev/null || { echo "gh is not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login" >&2; exit 1; }

[ ! -e "$WORK" ] || {
    echo "$WORK already exists; refusing to rotate signing identity by accident" >&2
    exit 1
}
mkdir -p "$WORK"

if command -v owfeed >/dev/null 2>&1; then
    OWFEED="$(command -v owfeed)"
else
    case "$(uname -m)" in
        x86_64|amd64) arch=amd64 ;;
        aarch64|arm64) arch=arm64 ;;
        *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
    esac
    case "$(uname -s)" in
        Linux) os=linux ;;
        Darwin) os=darwin ;;
        *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
    esac
    echo ">> downloading owfeed $OWFEED_VERSION"
    curl -fsSL -o "$WORK/owfeed"         "https://github.com/owfeed/owfeed/releases/download/$OWFEED_VERSION/owfeed-$os-$arch"
    chmod 0755 "$WORK/owfeed"
    OWFEED="$WORK/owfeed"
fi

"$OWFEED" keygen -force -o "$WORK/opera-proxy-sign.pem"
"$OWFEED" keygen -force -usign -o "$WORK/opera-proxy-release.key"

gh secret set OPERA_PROXY_SIGN_KEY --repo "$REPO" < "$WORK/opera-proxy-sign.pem"
gh secret set OPERA_PROXY_USIGN_KEY --repo "$REPO" < "$WORK/opera-proxy-release.key"

for name in OPERA_PROXY_SIGN_KEY OPERA_PROXY_USIGN_KEY; do
    gh secret list --repo "$REPO" | awk '{print $1}' | grep -Fxq "$name" || {
        echo "GitHub Actions secret was not created: $name" >&2
        exit 1
    }
done

mkdir -p keys
cp "$WORK/opera-proxy-sign.pub.pem" keys/opera-proxy-sign.pub.pem
cp "$WORK/opera-proxy-release.pub" keys/opera-proxy-release.pub

cat <<MSG
Signing identity created for $REPO.

PRIVATE — save outside git, then delete $WORK:
  $WORK/opera-proxy-sign.pem
  $WORK/opera-proxy-release.key

PUBLIC — commit before creating a release tag:
  keys/opera-proxy-sign.pub.pem
  keys/opera-proxy-release.pub

GitHub secrets set:
  OPERA_PROXY_SIGN_KEY
  OPERA_PROXY_USIGN_KEY

Do not rotate these keys for an ordinary release.
MSG
