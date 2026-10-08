#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/dist}"
BASE_VERSION="$(tr -d '[:space:]' < "$ROOT/version.txt")"
REV=4

if [ "${GITHUB_REF_TYPE:-}" = tag ] && [ -n "${GITHUB_REF_NAME:-}" ]; then
    TAG="${GITHUB_REF_NAME#v}"
    case "$TAG" in
        *-[0-9]*)
            TAG_BASE="${TAG%-*}"
            TAG_REV="${TAG##*-}"
            case "$TAG_REV" in *[!0-9]*|'') ;; *) BASE_VERSION="$TAG_BASE"; REV="$TAG_REV";; esac
            ;;
        *) BASE_VERSION="$TAG" ;;
    esac
fi

PKG_VERSION="${BASE_VERSION}-r${REV}"

: "${BIN_AMD64:?BIN_AMD64 is required}"
: "${BIN_ARM64:?BIN_ARM64 is required}"
: "${BIN_ARM:?BIN_ARM is required}"
: "${BIN_MIPS:?BIN_MIPS is required}"
: "${BIN_MIPSLE:?BIN_MIPSLE is required}"

for b in "$BIN_AMD64" "$BIN_ARM64" "$BIN_ARM" "$BIN_MIPS" "$BIN_MIPSLE"; do
    [ -s "$b" ] || { echo "binary missing or empty: $b" >&2; exit 1; }
done

rm -rf "$OUT/stage" "$OUT/scripts"
mkdir -p "$OUT/stage" "$OUT/scripts"
printf '%s\n' "$PKG_VERSION" > "$OUT/VERSION"

stage_arch() {
    arch="$1"
    bin="$2"
    dst="$OUT/stage/$arch"
    mkdir -p "$dst"
    cp -a "$ROOT/root/." "$dst/"
    mkdir -p "$dst/usr/bin" "$dst/usr/share/licenses/luci-app-opera-proxy"
    install -m 0755 "$bin" "$dst/usr/bin/opera-proxy"
    install -m 0644 "$ROOT/LICENSE" "$dst/usr/share/licenses/luci-app-opera-proxy/LICENSE"
    chmod 0755 "$dst/etc/init.d/opera-proxy"
    chmod 0644 "$dst/etc/config/opera-proxy"         "$dst/usr/share/luci/menu.d/luci-app-opera-proxy.json"         "$dst/usr/share/rpcd/acl.d/luci-app-opera-proxy.json"         "$dst/www/luci-static/resources/view/opera-proxy/config.js"
}

for arch in aarch64_generic aarch64_cortex-a53 aarch64_cortex-a72; do
    stage_arch "$arch" "$BIN_ARM64"
done
for arch in arm_cortex-a7_neon-vfpv4 arm_cortex-a9_vfpv3-d16; do
    stage_arch "$arch" "$BIN_ARM"
done
stage_arch mips_24kc "$BIN_MIPS"
stage_arch mipsel_24kc "$BIN_MIPSLE"
stage_arch x86_64 "$BIN_AMD64"

for s in postinst prerm; do
    sed -e '1s/^\xef\xbb\xbf//' -e 's/\r$//' "$ROOT/scripts/$s" > "$OUT/scripts/$s"
    chmod 0755 "$OUT/scripts/$s"
done

echo "staged luci-app-opera-proxy $PKG_VERSION"
