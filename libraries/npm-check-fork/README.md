# @rushstack/npm-check-fork

This package is a temporary rushstack maintained fork of [`npm-check`](https://github.com/dylang/npm-check), used internally by `rush upgrade-interactive`. It exists to address security vulnerabilities and compatibility issues present in the latest upstream version.

**Origin:**
- Forked from [`npm-check`](https://github.com/dylang/npm-check)
- Original copyright:
  ```
  Copyright (c) 2015 Dylan Greene
  Licensed under the MIT license.
  ```

**Purpose:**
This fork is expected to be temporary and will be removed once upstream issues are resolved.

## Changes from Upstream

- **Removed unused state properties:**
  Properties from the state object that were never set or used have been removed (see `INpmCheckState`).
- **Removed `peerDependencies` from `INpmCheckPackageSummary`:**
  This property was deprecated in `npm-check` and was never set.
- **Removed emoji support:**
  Emoji output was never used in rushstack/rush-lib and has been stripped out.
- **Downgraded `path-exists` dependency:**
  The latest version of `path-exists` is ESM-only; this fork uses a compatible CommonJS version.
- **Removed `semverDiff` dependency:**
  This was deprecated and its functionality has been replaced by direct usage of `semver`.

## License

This fork retains the original MIT license from `npm-check`.
