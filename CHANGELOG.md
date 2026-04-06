# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project uses Semantic Versioning.

## [Unreleased]

### Added

- Windows packaging scripts for unsigned and signed installers.
- Electron Builder configuration and renderer bundling for desktop packaging.
- PR CI workflow gates for workspace build, unit tests, and Playwright.
- Release manifest/checksum generation script and release process documentation.

### Changed

- Desktop renderer boot now prefers bundled `dist/renderer/index.html` when available.
- Windows smoke checklist now includes run metadata and explicit pass/fail capture.

## [0.1.0] - 2026-04-06

### Added

- Initial SSH term workspace implementation and test coverage across desktop, UI, and shared packages.
