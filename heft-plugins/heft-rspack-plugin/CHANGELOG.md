# Change Log - @rushstack/heft-rspack-plugin

This log was last generated on Fri, 20 Feb 2026 00:15:04 GMT and should not be manually modified.

## 0.3.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 0.3.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.2.9
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 0.2.8
Thu, 05 Feb 2026 01:54:04 GMT

### Patches

- Bump `webpack` dependency version to `~5.105.0`

## 0.2.7
Thu, 05 Feb 2026 00:23:59 GMT

### Patches

- Bump `webpack` dependency version to `~5.104.1`

## 0.2.6
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 0.2.5
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 0.2.4
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 0.2.3
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 0.2.2
Wed, 07 Jan 2026 01:12:24 GMT

_Version update only_

## 0.2.1
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 0.2.0
Thu, 18 Dec 2025 01:13:04 GMT

### Minor changes

- Update Webpack dependency to `~5.103.0`

## 0.1.2
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 0.1.1
Tue, 25 Nov 2025 17:03:49 GMT

### Patches

- Fix issue where ignoring ERR_MODULE_NOT_FOUND errors when importing the rspack config masks legitimate import issues.

## 0.1.0
Fri, 21 Nov 2025 16:13:55 GMT

### Minor changes

- Initial package release.

