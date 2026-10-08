#!/bin/sh
# Optional executable packing. Never replace a binary unless UPX test succeeds.
set -eu
UPX_BIN="${UPX_BIN:-upx}"
TARGET="${1:?usage: pack-upx.sh path/to/executable [test-command]}"
[ -s "$TARGET" ] || { echo "missing executable: $TARGET" >&2; exit 1; }
command -v "$UPX_BIN" >/dev/null 2>&1 || { echo "UPX unavailable; binary left untouched" >&2; exit 0; }
TMP="${TARGET}.upx-candidate"
cp "$TARGET" "$TMP"
trap 'rm -f "$TMP"' EXIT INT TERM
before="$(wc -c < "$TARGET")"
if ! "$UPX_BIN" --best --no-lzma "$TMP"; then
    echo "UPX declined $TARGET; original retained" >&2
    exit 0
fi
if ! "$UPX_BIN" -t "$TMP"; then
    echo "UPX integrity check failed; original retained" >&2
    exit 1
fi
after="$(wc -c < "$TMP")"
if [ "$after" -ge "$before" ]; then
    echo "UPX not smaller ($before -> $after); original retained"
    exit 0
fi
case "${2:-}" in
    run-version)
        if ! ${PACK_TEST_RUNNER:-} "$TMP" -version >/dev/null; then
            echo "UPX-packed binary failed version smoke test; original retained" >&2
            exit 1
        fi ;;
esac
mv "$TMP" "$TARGET"
chmod 0755 "$TARGET"
echo "UPX packed $TARGET: $before -> $after bytes"
