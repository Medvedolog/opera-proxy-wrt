# OpenWrt packaging

This fork packages the local patched opera-proxy core and LuCI payload with owfeed.

- OpenWrt 25.12: native APKv3
- OpenWrt 24.10: native IPK
- supported classes include x86_64, ARMv7, AArch64, MIPS/MIPSel 32-bit and MIPS/MIPSel 64-bit
- MIPS builds use soft-float Go targets for broad router compatibility

The package is staged by `tools/stage.sh` into `dist/stage/{arch}`. nFPM is not used.

For a release, use a tag matching the upstream base version, e.g. `v1.30.0`; a numeric suffix such as `v1.30.0-2` becomes package revision `1.30.0-r2`.

Signed owfeed release publication should use dedicated project signing keys; do not generate a new signing key on every CI run.
