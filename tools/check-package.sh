#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

for arch in aarch64_generic aarch64_cortex-a53 aarch64_cortex-a72 arm_cortex-a7_neon-vfpv4 arm_cortex-a9_vfpv3-d16 mips_24kc mipsel_24kc x86_64; do
    find "dist/$arch" -maxdepth 1 -type f \( -name 'luci-app-opera-proxy_*.ipk' -o -name 'luci-app-opera-proxy-*.apk' \) | grep -q .
done

ipk="$(find dist/x86_64 -maxdepth 1 -type f -name 'luci-app-opera-proxy_*.ipk' | head -n1)"
[ -n "$ipk" ] || { echo "x86_64 IPK not found" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar xzf "$ipk" -C "$work"
mkdir -p "$work/data" "$work/control"
tar xzf "$work/data.tar.gz" -C "$work/data"
tar xzf "$work/control.tar.gz" -C "$work/control"

for f in   usr/bin/opera-proxy   etc/init.d/opera-proxy   etc/config/opera-proxy   usr/share/luci/menu.d/luci-app-opera-proxy.json   usr/share/rpcd/acl.d/luci-app-opera-proxy.json   www/luci-static/resources/view/opera-proxy/config.js   usr/libexec/opera-proxy-probe
do
    [ -e "$work/data/$f" ] || { echo "missing package payload: /$f" >&2; exit 1; }
done

grep -qx '/etc/config/opera-proxy' "$work/control/conffiles"
test -x "$work/data/usr/bin/opera-proxy"
test -x "$work/data/etc/init.d/opera-proxy"
test -x "$work/data/usr/libexec/opera-proxy-probe"

echo "package checks passed"
