# Change Log - @rushstack/rush-pnpm-kit-v8

This log was last generated on Fri, 20 Feb 2026 16:14:49 GMT and should not be manually modified.

## 0.2.3
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 0.2.2
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 0.2.1
Thu, 19 Feb 2026 01:30:06 GMT

### Patches

- Filter files from publish.

## 0.2.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.1.7
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 0.1.6
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 0.1.5
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 0.1.4
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 0.1.3
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 0.1.2
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 0.1.1
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 0.1.0
Wed, 24 Dec 2025 01:12:52 GMT

### Minor changes

- Set up the `@rushstack/rush-pnpm-kit-v8` package to bundle all pnpm v8 related packages together.

