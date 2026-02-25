# Change Log - @rushstack/credential-cache

This log was last generated on Wed, 25 Feb 2026 00:34:29 GMT and should not be manually modified.

## 0.2.5
Wed, 25 Feb 2026 00:34:29 GMT

_Version update only_

## 0.2.4
Tue, 24 Feb 2026 01:13:27 GMT

_Version update only_

## 0.2.3
Mon, 23 Feb 2026 00:42:21 GMT

_Version update only_

## 0.2.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 0.2.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 0.2.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.1.11
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 0.1.10
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 0.1.9
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 0.1.8
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 0.1.7
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 0.1.6
Wed, 07 Jan 2026 01:12:24 GMT

_Version update only_

## 0.1.5
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 0.1.4
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 0.1.3
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 0.1.2
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 0.1.1
Tue, 04 Nov 2025 08:15:14 GMT

_Version update only_

## 0.1.0
Fri, 24 Oct 2025 00:13:38 GMT

### Minor changes

- Create dedicated package for the Rush "CredentialCache" API. This API manages credential persistence on the local machine.

