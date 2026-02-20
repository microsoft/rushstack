# Change Log - @rushstack/heft-json-schema-typings-plugin

This log was last generated on Fri, 20 Feb 2026 00:15:04 GMT and should not be manually modified.

## 1.2.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.2.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.
- Add support for the `x-tsdoc-release-tag` custom property in JSON schema files. When present (e.g. `"x-tsdoc-release-tag": "@beta"`), the specified TSDoc release tag is injected into the generated `.d.ts` declarations, allowing API Extractor to apply the correct release level when these types are re-exported from package entry points.
- Add a `formatWithPrettier` option (defaults to `false`) to skip prettier formatting of generated typings.

## 1.1.14
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.1.13
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.1.12
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.1.11
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.1.10
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.1.9
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 1.1.8
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 1.1.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.1.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.1.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.1.4
Tue, 04 Nov 2025 08:15:14 GMT

_Version update only_

## 1.1.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 1.1.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 1.1.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 1.1.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 1.0.0
Tue, 30 Sep 2025 23:57:45 GMT

### Breaking changes

- Release Heft version 1.0.0

## 0.1.6
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.1.5
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.1.4
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.1.3
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.1.2
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 0.1.1
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.1.0
Wed, 09 Jul 2025 04:01:17 GMT

### Minor changes

- Initial release.

