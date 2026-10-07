#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

for f in     root/etc/config/opera-proxy     root/etc/init.d/opera-proxy     root/usr/share/luci/menu.d/luci-app-opera-proxy.json     root/usr/share/rpcd/acl.d/luci-app-opera-proxy.json     root/www/luci-static/resources/view/opera-proxy/config.js     scripts/postinst     scripts/prerm
do
    [ -s "$f" ] || { echo "missing required package file: $f" >&2; exit 1; }
done

sh -n root/etc/init.d/opera-proxy
sh -n scripts/postinst
sh -n scripts/prerm
jq -e . root/usr/share/luci/menu.d/luci-app-opera-proxy.json >/dev/null
jq -e . root/usr/share/rpcd/acl.d/luci-app-opera-proxy.json >/dev/null

vendor_re='zeroblock\.routerich|24:0F:5E|24:0f:5e|mac\+gen'
if grep -n -E "$vendor_re" ./*.go 2>/dev/null; then
    echo "vendor-specific RouterRich gate/reference found in Go sources" >&2
    exit 1
fi
if grep -R -n -E "$vendor_re" root .github/workflows 2>/dev/null; then
    echo "vendor-specific RouterRich gate/reference found in package/workflow files" >&2
    exit 1
fi

grep -q "api_proxy_builtin" root/etc/config/opera-proxy
grep -q "mem_limit_mb" root/etc/config/opera-proxy
grep -q "idle_timeout" root/etc/config/opera-proxy

echo "source/package-tree checks passed"
