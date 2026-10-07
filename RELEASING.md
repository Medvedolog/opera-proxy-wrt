# OpenWrt releases via owfeed

The fork builds the local patched `opera-proxy` core and LuCI payload from one source tree.

## Package formats

- OpenWrt 25.12 — native APKv3
- OpenWrt 24.10 — native IPK

Architectures currently staged and built include x86_64, ARMv7, AArch64,
MIPS/MIPSel 32-bit and MIPS/MIPSel 64-bit. MIPS builds are pure Go
(`CGO_ENABLED=0`) with soft-float targets for broad router compatibility.

nFPM is not used.

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

A tag `v1.30.0` currently produces `1.30.0-r2`.
A tag `v1.30.0-N` produces `1.30.0-rN`.

Do not create the first release tag until the public keys are committed and the
two Actions secrets exist.
