# Auto-Update (electron-updater + GitHub Releases)

HyperShell checks GitHub Releases on launch and every ~4h. On Windows and
Linux it downloads and installs in-app (notify + one-click). On macOS it
shows a "Download" link to the release page (the macOS build is not signed
/ notarized, so unsigned auto-install is not offered).

## Bootstrap caveat (first auto-update-enabled release)

Auto-update relies on `app-update.yml`, which is only bundled into builds
produced **after** `publish: github` was added to `electron-builder.yml`.

Consequence: the **first** release built with auto-update enabled cannot
deliver itself to existing users — they must install it manually one last
time. Every release **after** that one auto-updates normally. Call this out
in the release notes for the first auto-update build.

## Release metadata

The CI release jobs upload, in this order, to each GitHub Release:
1. The installer (`*.exe` / `*.AppImage`)
2. `latest.yml` / `latest-linux.yml`
3. `*.blockmap`

Order matters: clients poll `latest*.yml`; uploading it before the
installer would briefly advertise a version whose asset 404s.
