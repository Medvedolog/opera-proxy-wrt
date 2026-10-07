# Release signing keys

This repository publishes OpenWrt packages through `owfeed`.

Before the first tagged release, run on a trusted machine:

```sh
./tools/setup-keys.sh
```

The script creates two persistent signing identities:

- `OPERA_PROXY_SIGN_KEY` — EC prime256v1 package-signing private key, stored only in GitHub Actions secrets;
- `OPERA_PROXY_USIGN_KEY` — usign release-manifest private key, stored only in GitHub Actions secrets.

Commit only their public halves:

- `keys/opera-proxy-sign.pub.pem`
- `keys/opera-proxy-release.pub`

Never commit the private files from `keys-setup/` and do not rotate keys for routine releases.
