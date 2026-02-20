# Change Log - @rushstack/zipsync

This log was last generated on Fri, 20 Feb 2026 16:14:49 GMT and should not be manually modified.

## 0.3.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 0.3.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 0.3.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.2.14
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 0.2.13
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 0.2.12
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 0.2.11
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 0.2.10
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 0.2.9
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 0.2.8
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 0.2.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 0.2.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 0.2.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 0.2.4
Tue, 04 Nov 2025 08:15:15 GMT

_Version update only_

## 0.2.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 0.2.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 0.2.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 0.2.0
Fri, 03 Oct 2025 20:10:00 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 0.1.1
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 0.1.0
Tue, 30 Sep 2025 20:33:51 GMT

### Minor changes

- Add zipsync tool to pack and unpack build cache entries.

