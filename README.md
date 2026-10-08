<div align="center">

# Opera Proxy for OpenWrt

### Прокси-сервер для OpenWrt с выходом через Opera VPN, настройкой в LuCI и резервным доступом к API

[![Release](https://img.shields.io/github/v/release/Medvedolog/opera-proxy-wrt?style=for-the-badge&label=RELEASE&color=8b5cf6)](https://github.com/Medvedolog/opera-proxy-wrt/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Medvedolog/opera-proxy-wrt/ci.yml?branch=master&style=for-the-badge&label=BUILD&color=22c55e)](https://github.com/Medvedolog/opera-proxy-wrt/actions/workflows/ci.yml)
[![OpenWrt](https://img.shields.io/badge/OpenWrt-24.10%20%7C%2025.12-00B5E2?style=for-the-badge&logo=openwrt&logoColor=white)](https://openwrt.org/)
[![License](https://img.shields.io/github/license/Medvedolog/opera-proxy-wrt?style=for-the-badge&color=f59e0b)](LICENSE)

![SOCKS5](https://img.shields.io/badge/PROXY-SOCKS5-2563eb?style=flat-square)
![HTTP](https://img.shields.io/badge/PROXY-HTTP-059669?style=flat-square)
![LuCI](https://img.shields.io/badge/UI-LuCI-a855f7?style=flat-square)
![MIPS](https://img.shields.io/badge/ARCH-MIPS%20%2F%20ARM%20%2F%20x86--64-f97316?style=flat-square)
![owfeed](https://img.shields.io/badge/BUILD-owfeed-0ea5e9?style=flat-square)

**Русский** · [English](README.en.md)

[**Скачать релиз**](https://github.com/Medvedolog/opera-proxy-wrt/releases) · [**GitHub Actions**](https://github.com/Medvedolog/opera-proxy-wrt/actions) · [**Сборка и подпись**](RELEASING.md)

</div>

---

## Что это

**Opera Proxy for OpenWrt** — пакет «всё в одном» для маршрутизаторов OpenWrt: собственный бинарник `opera-proxy`, служба `procd`, UCI-конфигурация и веб-интерфейс **LuCI**. Предоставляет локальный SOCKS5- или HTTP-прокси, передающий запросы через инфраструктуру Opera VPN / SurfEasy.

Проект основан на открытом [Alexey71/opera-proxy](https://github.com/Alexey71/opera-proxy) и развивает его в сторону удобного использования на маршрутизаторах, устойчивого подключения и нативной пакетной системы OpenWrt.

> [!IMPORTANT]
> Это **прокси-сервер, а не общесистемный VPN**. Трафик через него идёт только у приложений и клиентов, которым задан адрес прокси, либо при использовании внешних правил маршрутизации.

## Возможности

| | Возможность | Для чего |
|:--:|---|---|
| 🌐 | **SOCKS5 и HTTP** | Выбор протокола локального прокси |
| 🛡️ | **Устойчивый API bootstrap** | Автоматический подбор публичных резервных прокси для доступа к SurfEasy API |
| 🔄 | **Endpoint failover** | Переключение между рабочими серверами, повторное обнаружение конечных точек |
| 🧭 | **Выбор региона** | EU, AS, AM и другие регионы, доступные через API |
| 🖥️ | **LuCI** | Настройки, состояние процесса, память, управление сервисом и журналы |
| 🧪 | **Проверка 5 сервисов** | Telegram API, GitHub, Claude, YouTube и ChatGPT через текущий прокси |
| 🎨 | **Темы и подсказки** | Светлая/тёмная тема, сворачиваемые секции, пояснения параметров |
| 🧠 | **Контроль ресурсов** | Ограничение памяти Go и таймаут неактивных туннелей |
| 📦 | **Нативные пакеты owfeed** | IPK для OpenWrt 24.10 и APK для OpenWrt 25.12 |

## Скачать и установить

Перейдите в [**Releases**](https://github.com/Medvedolog/opera-proxy-wrt/releases) и выберите файл **`luci-app-opera-proxy`** под версию OpenWrt и архитектуру устройства. Отдельно скачивать бинарник не требуется — он уже входит в пакет LuCI.

| OpenWrt | Формат | Пример пакета |
|---|---|---|
| **24.10.x** | `.ipk` / opkg | `luci-app-opera-proxy_1.30.0-r3_mipsel_24kc.ipk` |
| **25.12.x** | `.apk` / apk | `luci-app-opera-proxy-…apk` |

Для Xiaomi Mi Router 3G (MT7621) используется архитектура **`mipsel_24kc`**.

<details>
<summary><b>Установка IPK — OpenWrt 24.10</b></summary>

Скопируйте нужный пакет в `/tmp/` на роутере, затем выполните:

```sh
opkg install /tmp/luci-app-opera-proxy_1.30.0-r3_mipsel_24kc.ipk
```

Имя файла здесь — пример для `mipsel_24kc`; для других устройств подставьте свою архитектуру. Если opkg сообщает об отсутствующих зависимостях, проверьте доступность репозиториев OpenWrt и выполните `opkg update`.

</details>

<details>
<summary><b>Установка APK — OpenWrt 25.12</b></summary>

Скопируйте соответствующий `.apk` в `/tmp/`:

```sh
apk add --allow-untrusted /tmp/luci-app-opera-proxy-*.apk
```

При использовании настроенного доверенного подписанного репозитория устанавливайте пакет обычным способом через `apk add luci-app-opera-proxy`.

</details>

После установки откройте **Сервисы → Opera Proxy** в LuCI.

## Быстрый старт

1. Откройте **Opera Proxy** в LuCI и включите службу.
2. Выберите регион и режим **SOCKS5** либо **HTTP**.
3. По умолчанию прокси слушает **`127.0.0.1:18080`** — этот адрес доступен только самому роутеру.
4. Сохраните конфигурацию, запустите сервис и нажмите **Test proxy**.
5. Настройте приложение-клиент на использование прокси. Для доступа устройств LAN укажите слушающий LAN-адрес, а также настройте соответствующий доступ в firewall.

> [!CAUTION]
> Не открывайте прокси для WAN и не используйте `0.0.0.0` без настроенных ограничений доступа. В пакете нет встроенной пользовательской аутентификации для локального прокси.

### Проверка из SSH

Для стандартного SOCKS5-режима:

```sh
curl --proxy socks5h://127.0.0.1:18080 https://api.github.com/
```

Встроенная многосервисная диагностика:

```sh
/usr/libexec/opera-proxy-probe
```

## LuCI: что можно настроить

<details>
<summary><b>Статус и диагностика</b></summary>

- Состояние процесса, PID, RSS/VmSize, режим и адрес прослушивания.
- Start / Stop / Restart и встроенная проверка пяти сервисов.
- HTTP-статусы и задержки по каждому проверяемому ресурсу.
- Чтение журнала `logread` без SSH.

</details>

<details>
<summary><b>Подключение и устойчивость</b></summary>

- `country`, `socks_mode`, `bind_address`, `server_selection`.
- `bootstrap_dns` — DNS-over-TLS, DNS-over-HTTPS или обычный DNS для начального соединения.
- `api_proxy`, `api_proxy_file`, `api_proxy_list_url` — дополнительные пути доступа к API.
- `api_proxy_builtin`, `api_proxy_parallel`, `api_proxy_max` — автоматический fallback и его лимиты.
- `mem_limit_mb`, `idle_timeout` — настройки для устройств с небольшим объёмом ОЗУ.

</details>

<details>
<summary><b>Идентификация браузера</b></summary>

Профили Opera/Chrome для совместимости с SurfEasy API, а также ручные поля `api_client_version`, `api_client_type` и `api_user_agent`. Обычно достаточно значений по умолчанию.

</details>

## Поддерживаемые архитектуры

Сборки включают **x86_64, ARMv7, AArch64, MIPS/MIPSel 32-bit и MIPS/MIPSel 64-bit**. Для MIPS используется pure-Go cross-build с soft-float (`CGO_ENABLED=0`).

CI собирает матрицу платформ и проверяет установку пакетов в OpenWrt **24.10.8** и **25.12.5** через `owlab`. Фактическое поведение на конкретной плате зависит от ресурсов, прошивки и доступности удалённых серверов; тест CI не заменяет испытаний на оборудовании.

## Сборка из исходников

Для Linux/macOS и других поддерживаемых Go-платформ доступно самостоятельное использование консольного бинарника. Потребуется версия Go из [`go.mod`](go.mod).

```sh
go test ./...
go build -o opera-proxy .
./opera-proxy -country EU -socks-mode -bind-address 127.0.0.1:18080
```

Все флаги: `./opera-proxy -help`. Описание пакетного CI, подписей и релизов — [`RELEASING.md`](RELEASING.md).

## Ссылки и лицензия

- **Исходный проект:** [Alexey71/opera-proxy](https://github.com/Alexey71/opera-proxy).
- **Этот форк для OpenWrt:** [Medvedolog/opera-proxy-wrt](https://github.com/Medvedolog/opera-proxy-wrt).
- **Лицензия:** [MIT](LICENSE).

> [!NOTE]
> Работа сервиса зависит от доступности Opera VPN / SurfEasy и сетевых ограничений провайдера; постоянная доступность конкретного региона или сервера не гарантируется.
