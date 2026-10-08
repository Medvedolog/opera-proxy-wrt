# OpenWrt releases via owfeed

The fork builds the local patched `opera-proxy` core and LuCI payload from one source tree.

## Package formats

- OpenWrt 25.12 — native APKv3
- OpenWrt 24.10 — native IPK

The targeted package matrix includes x86_64, AArch64 (generic, Cortex-A53 and Cortex-A72), ARMv7 (Cortex-A7 NEON/VFPv4 and Cortex-A9 VFPv3-D16), and 32-bit MIPS/MIPSel 24kc. MIPS builds are pure Go
(`CGO_ENABLED=0`) with soft-float targets for broad router compatibility.

nFPM is not used.

## ELF size and memory trade-offs

Go binaries are already built with `-trimpath -ldflags="-s -w -buildid="`.
The CI attempts UPX on x86_64, ARMv7 and AArch64; it checks UPX integrity
and executes the packed binary's `-version` command before packaging.
ARM target binaries are smoke-tested using qemu-arm or qemu-aarch64 respectively.
If UPX refuses the executable or yields no size reduction, CI keeps the
uncompressed stripped ELF. These are emulated smoke tests, not a guarantee of
behavior on every OpenWrt kernel; device-level RAM and connectivity testing is
recommended before treating ARM UPX as a supported production default.

MIPS and MIPSel stay stripped but **not UPX packed** by default. UPX
decompression can increase startup RAM usage, and x86 smoke tests cannot
establish compatibility with a router's MIPS kernel. Before enabling UPX for
MIPS release packages, measure uncompressed/packed file size, `VmRSS`,
startup time and successful proxy traffic on a representative OpenWrt device.
The optional helper `sh tools/pack-upx.sh path/to/binary` allows local
experiments without altering release defaults.

## CI pipeline

```text
source checks + go test
        |
multi-arch Go cross-build
        |
tools/stage.sh
        |
owfeed plan/check/build
        |
package structural checks
        |
owlab OpenWrt 25.12.5 APK install
owlab OpenWrt 24.10.8 IPK install
        |
(tag only)
release-preflight
        |
owfeed sign + signed manifest + GitHub Release
```

The release workflow signs and publishes the exact artifact produced by the
build job that already passed `owlab`; it does not rebuild packages.

## One-time signing setup

On a trusted machine with `gh` authenticated for this repository:

```sh
./tools/setup-keys.sh
git add keys/opera-proxy-sign.pub.pem keys/opera-proxy-release.pub
git commit -m "chore: add owfeed author signing keys"
git push
```

The script uploads the private halves to GitHub Actions secrets:

- `OPERA_PROXY_SIGN_KEY`
- `OPERA_PROXY_USIGN_KEY`

and leaves the public halves under `keys/` for commit.

Keep the private copies outside git and delete `keys-setup/` afterwards.

## Versioning

The base package version is read from `version.txt`.

A tag `v1.30.0` currently produces `1.30.0-r3`.
A tag `v1.30.0-N` produces `1.30.0-rN`.

Do not create the first release tag until the public keys are committed and the
two Actions secrets exist.
