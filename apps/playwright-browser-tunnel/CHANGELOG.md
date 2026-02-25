# Change Log - @rushstack/playwright-browser-tunnel

This log was last generated on Wed, 25 Feb 2026 21:39:42 GMT and should not be manually modified.

## 0.3.7
Wed, 25 Feb 2026 21:39:42 GMT

_Version update only_

## 0.3.6
Wed, 25 Feb 2026 00:34:29 GMT

### Patches

- Add playwright-versioning and remove semver

## 0.3.5
Tue, 24 Feb 2026 01:13:27 GMT

_Version update only_

## 0.3.4
Mon, 23 Feb 2026 00:42:21 GMT

_Version update only_

## 0.3.3
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 0.3.2
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 0.3.1
Thu, 19 Feb 2026 01:30:06 GMT

### Patches

- Filter files from publish and include missing LICENSE file.

## 0.3.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.2.4
Wed, 11 Feb 2026 23:14:09 GMT

### Patches

- Update module layout to isolate code that does not depend on Playwright.

## 0.2.3
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 0.2.2
Wed, 04 Feb 2026 20:42:47 GMT

### Patches

- Add advanced logging and websocket close codes

## 0.2.1
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 0.2.0
Fri, 30 Jan 2026 22:38:36 GMT

### Minor changes

- Update marker file names to reflect Copilot rebranding

## 0.1.1
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 0.1.0
Sat, 24 Jan 2026 01:13:02 GMT

### Minor changes

- Introduce CLI based tool to launch a remote browser provider for Playwright.

