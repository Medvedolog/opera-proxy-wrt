<div align="center">

# Opera Proxy for OpenWrt

### Opera VPN over SOCKS5 / HTTP · LuCI · automatic connection recovery

[![Release](https://img.shields.io/github/v/release/Medvedolog/opera-proxy-wrt?style=for-the-badge&label=RELEASE&color=8b5cf6)](https://github.com/Medvedolog/opera-proxy-wrt/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Medvedolog/opera-proxy-wrt/ci.yml?branch=master&style=for-the-badge&label=BUILD&color=22c55e)](https://github.com/Medvedolog/opera-proxy-wrt/actions/workflows/ci.yml)
[![OpenWrt](https://img.shields.io/badge/OpenWrt-24.10%20%7C%2025.12-00B5E2?style=for-the-badge&logo=openwrt&logoColor=white)](https://openwrt.org/)
[![License](https://img.shields.io/github/license/Medvedolog/opera-proxy-wrt?style=for-the-badge&color=f59e0b)](LICENSE)

![SOCKS5](https://img.shields.io/badge/PROXY-SOCKS5-2563eb?style=flat-square)
![HTTP](https://img.shields.io/badge/PROXY-HTTP-059669?style=flat-square)
![LuCI](https://img.shields.io/badge/UI-LuCI-a855f7?style=flat-square)
![MIPS](https://img.shields.io/badge/ARCH-MIPS%20%2F%20ARM%20%2F%20x86--64-f97316?style=flat-square)
![owfeed](https://img.shields.io/badge/BUILD-owfeed-0ea5e9?style=flat-square)

[Русский](README.md) · **English**

[**Download releases**](https://github.com/Medvedolog/opera-proxy-wrt/releases) · [**GitHub Actions**](https://github.com/Medvedolog/opera-proxy-wrt/actions) · [**Build and signing**](RELEASING.md)

</div>

---

## Overview

**Opera Proxy for OpenWrt** is an all-in-one package for OpenWrt routers, combining the `opera-proxy` executable, a `procd` service, UCI configuration and the **LuCI** web interface. It exposes a local SOCKS5 or HTTP proxy and forwards requests through the Opera VPN / SurfEasy infrastructure.

Based on the open-source [Alexey71/opera-proxy](https://github.com/Alexey71/opera-proxy), this fork focuses on router-friendly operation, resilient connectivity and native OpenWrt packaging.

> [!IMPORTANT]
> This is **a proxy server, not a system-wide VPN**. Only applications explicitly configured to use the proxy (or traffic redirected by separately configured routing rules) will go through it.

## Features

| | Feature | Purpose |
|:--:|---|---|
| 🌐 | **SOCKS5 and HTTP** | Choose the protocol of the local proxy listener |
| 🛡️ | **Resilient API bootstrap** | Automatically try public fallback proxies to reach the SurfEasy API |
| 🔄 | **Endpoint failover** | Switch away from failing servers and rediscover endpoints |
| 🧭 | **Region selection** | EU, AS, AM and other regions exposed by the API |
| 🖥️ | **LuCI** | Settings, process status, memory consumption, service controls and logs |
| 🧪 | **Five-service probe** | Test Telegram API, GitHub, Claude, YouTube and ChatGPT through the active proxy |
| 🎨 | **Theme-aware UI** | Light/dark theme support, collapsible sections and inline help |
| 🧠 | **Resource controls** | Go memory limit and idle tunnel timeout |
| 📦 | **Native owfeed packages** | IPK for OpenWrt 24.10 and APK for OpenWrt 25.12 |

## Download and install

Open [**Releases**](https://github.com/Medvedolog/opera-proxy-wrt/releases) and pick the **`luci-app-opera-proxy`** package matching your OpenWrt version and CPU architecture. The executable is bundled; a separate binary download is unnecessary.

| OpenWrt | Package format | Example |
|---|---|---|
| **24.10.x** | `.ipk` / opkg | `luci-app-opera-proxy_1.30.0-r3_mipsel_24kc.ipk` |
| **25.12.x** | `.apk` / apk | `luci-app-opera-proxy-…apk` |

Xiaomi Mi Router 3G (MT7621) uses the **`mipsel_24kc`** architecture.

<details>
<summary><b>Install an IPK on OpenWrt 24.10</b></summary>

Copy the correct package to `/tmp/` on the router, then run:

```sh
opkg install /tmp/luci-app-opera-proxy_1.30.0-r3_mipsel_24kc.ipk
```

The filename is an example for `mipsel_24kc`. Substitute your device's architecture. If opkg reports missing dependencies, check the configured OpenWrt package feeds and run `opkg update`.

</details>

<details>
<summary><b>Install an APK on OpenWrt 25.12</b></summary>

Copy the matching `.apk` to `/tmp/`:

```sh
apk add --allow-untrusted /tmp/luci-app-opera-proxy-*.apk
```

If you have configured the trusted signed package feed, install normally using `apk add luci-app-opera-proxy`.

</details>

After installing, open **Services → Opera Proxy** in LuCI.

## Quick start

1. Open **Opera Proxy** in LuCI and enable the service.
2. Select a region and choose **SOCKS5** or **HTTP** mode.
3. By default, the service listens at **`127.0.0.1:18080`**, accessible only from the router itself.
4. Save the configuration, start the service and click **Test proxy**.
5. Point your application at the local proxy. For clients on your LAN, bind to a suitable LAN address and configure the firewall accordingly.

> [!CAUTION]
> Do not expose the listener to the WAN or bind it to `0.0.0.0` without access controls. The packaged local proxy does not provide built-in user authentication.

### Test from SSH

For the default SOCKS5 mode:

```sh
curl --proxy socks5h://127.0.0.1:18080 https://api.github.com/
```

Built-in multi-service diagnostic:

```sh
/usr/libexec/opera-proxy-probe
```

## LuCI configuration

<details>
<summary><b>Status and diagnostics</b></summary>

- Process state, PID, RSS/VmSize, proxy mode and listening address.
- Start / Stop / Restart and a built-in five-service connectivity probe.
- HTTP status codes and response times for each tested service.
- Access to `logread` messages without an SSH session.

</details>

<details>
<summary><b>Connectivity and resilience</b></summary>

- `country`, `socks_mode`, `bind_address`, `server_selection`.
- `bootstrap_dns` — DNS over TLS, HTTPS or plain DNS during initial API discovery.
- `api_proxy`, `api_proxy_file`, `api_proxy_list_url` — additional routes to the API.
- `api_proxy_builtin`, `api_proxy_parallel`, `api_proxy_max` — automatic fallback and its resource limits.
- `mem_limit_mb`, `idle_timeout` — tuning for memory-constrained devices.

</details>

<details>
<summary><b>Browser identity</b></summary>

Opera/Chrome profiles used for SurfEasy API compatibility, plus manual `api_client_version`, `api_client_type`, and `api_user_agent` fields. Defaults are recommended for most users.

</details>

## Supported architectures

Packages are built for **x86_64, ARMv7, AArch64, 32-bit MIPS/MIPSel and 64-bit MIPS/MIPSel**. MIPS binaries are compiled with pure Go and soft-float (`CGO_ENABLED=0`).

CI builds the full architecture matrix and verifies package installation in OpenWrt **24.10.8** and **25.12.5** using `owlab`. Device-specific behavior depends on memory, firmware and remote server availability; CI tests are not a substitute for hardware testing.

## Build from source

The standalone CLI can be built for Linux/macOS and other supported Go targets. Use the Go version specified in [`go.mod`](go.mod).

```sh
go test ./...
go build -o opera-proxy .
./opera-proxy -country EU -socks-mode -bind-address 127.0.0.1:18080
```

See `./opera-proxy -help` for CLI options. Package CI, signing and release procedures are documented in [`RELEASING.md`](RELEASING.md).

## Links and license

- **Upstream:** [Alexey71/opera-proxy](https://github.com/Alexey71/opera-proxy).
- **OpenWrt fork:** [Medvedolog/opera-proxy-wrt](https://github.com/Medvedolog/opera-proxy-wrt).
- **License:** [MIT](LICENSE).

> [!NOTE]
> Service availability depends on Opera VPN / SurfEasy and local network restrictions. No particular exit region or endpoint is guaranteed to remain reachable.
