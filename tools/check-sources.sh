#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

for f in     root/etc/config/opera-proxy     root/etc/init.d/opera-proxy     root/usr/share/luci/menu.d/luci-app-opera-proxy.json     root/usr/share/rpcd/acl.d/luci-app-opera-proxy.json     root/www/luci-static/resources/view/opera-proxy/config.js     scripts/postinst     scripts/prerm     root/usr/libexec/opera-proxy-probe
do
    [ -s "$f" ] || { echo "missing required package file: $f" >&2; exit 1; }
done

sh -n root/etc/init.d/opera-proxy
sh -n scripts/postinst
sh -n scripts/prerm
sh -n root/usr/libexec/opera-proxy-probe
jq -e . root/usr/share/luci/menu.d/luci-app-opera-proxy.json >/dev/null
jq -e . root/usr/share/rpcd/acl.d/luci-app-opera-proxy.json >/dev/null

grep -q "api_proxy_builtin" root/etc/config/opera-proxy
grep -q "mem_limit_mb" root/etc/config/opera-proxy
grep -q "idle_timeout" root/etc/config/opera-proxy

echo "source/package-tree checks passed"

grep -q "api.telegram.org" root/usr/libexec/opera-proxy-probe
grep -q "api.anthropic.com" root/usr/libexec/opera-proxy-probe
grep -q "www.youtube.com" root/usr/libexec/opera-proxy-probe
grep -q "ab.chatgpt.com" root/usr/libexec/opera-proxy-probe
grep -q "api.github.com" root/usr/libexec/opera-proxy-probe

grep -q "makeSectionsCollapsible" root/www/luci-static/resources/view/opera-proxy/config.js
grep -q "FIELD_HELP" root/www/luci-static/resources/view/opera-proxy/config.js
grep -q "data-tooltip" root/www/luci-static/resources/view/opera-proxy/config.js
grep -q "localStorage" root/www/luci-static/resources/view/opera-proxy/config.js
