# Change Log - @rushstack/heft-typescript-plugin

This log was last generated on Tue, 24 Feb 2026 01:13:27 GMT and should not be manually modified.

## 1.2.4
Tue, 24 Feb 2026 01:13:27 GMT

_Version update only_

## 1.2.3
Mon, 23 Feb 2026 00:42:21 GMT

_Version update only_

## 1.2.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 1.2.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.2.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

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
Mon, 05 Jan 2026 16:12:49 GMT

### Patches

- Fix TypeScript build cache hash computation to use relative paths with normalized separators for portability across machines and platforms

## 1.1.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.1.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.1.5
Wed, 12 Nov 2025 01:12:56 GMT

### Patches

- Support "${configDir}" token in tsconfig when using file copier.

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

## 0.9.15
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.9.14
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.9.13
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.9.12
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.9.11
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 0.9.10
Mon, 28 Jul 2025 15:11:56 GMT

### Patches

- Update internal typings.

## 0.9.9
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.9.8
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.9.7
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.9.6
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.9.5
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.9.4
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.9.3
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.9.2
Thu, 17 Apr 2025 00:11:21 GMT

### Patches

- Update documentation for `extends`

## 0.9.1
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 0.9.0
Wed, 09 Apr 2025 00:11:02 GMT

### Minor changes

- Leverage Heft's new `tryLoadProjectConfigurationFileAsync` method.

## 0.8.2
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 0.8.1
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 0.8.0
Wed, 12 Mar 2025 22:41:36 GMT

### Minor changes

- Expose some internal APIs to be used by `@rushstack/heft-isolated-typescript-transpile-plugin`.

## 0.7.1
Wed, 12 Mar 2025 00:11:31 GMT

_Version update only_

## 0.7.0
Tue, 11 Mar 2025 02:12:33 GMT

### Minor changes

- Add support for TypeScript 5.8.

## 0.6.16
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.6.15
Sat, 01 Mar 2025 07:23:16 GMT

### Patches

- Add support for TypeScript 5.7.

## 0.6.14
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.6.13
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.6.12
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 0.6.11
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.6.10
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.6.9
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.6.8
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.6.7
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.6.6
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.6.5
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.6.4
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.6.3
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.6.2
Tue, 03 Dec 2024 16:11:07 GMT

_Version update only_

## 0.6.1
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.6.0
Fri, 22 Nov 2024 01:10:43 GMT

### Minor changes

- Add "onlyResolveSymlinksInNodeModules" option to improve performance for typical repository layouts.

## 0.5.35
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.5.34
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.5.33
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.5.32
Wed, 16 Oct 2024 00:11:20 GMT

### Patches

- Support typescript v5.6

## 0.5.31
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.5.30
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 0.5.29
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.5.28
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.5.27
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.5.26
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.5.25
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.5.24
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.5.23
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.5.22
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.5.21
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 0.5.20
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 0.5.19
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.5.18
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 0.5.17
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.5.16
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.5.15
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.5.14
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 0.5.13
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.5.12
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.5.11
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.5.10
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.5.9
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 0.5.8
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.5.7
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.5.6
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.5.5
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.5.4
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.5.3
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 0.5.2
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 0.5.1
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.5.0
Thu, 28 Mar 2024 22:42:23 GMT

### Minor changes

- Gracefully exit transpile worker instead of using `process.exit(0)`.

## 0.4.0
Tue, 19 Mar 2024 15:10:18 GMT

### Minor changes

- Bump latest supported version of TypeScript to 5.4

## 0.3.21
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 0.3.20
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 0.3.19
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 0.3.18
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 0.3.17
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 0.3.16
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 0.3.15
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 0.3.14
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.3.13
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 0.3.12
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.3.11
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 0.3.10
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.3.9
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 0.3.8
Mon, 19 Feb 2024 21:54:26 GMT

_Version update only_

## 0.3.7
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 0.3.6
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 0.3.5
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 0.3.4
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.3.3
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.3.2
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 0.3.1
Tue, 23 Jan 2024 16:15:05 GMT

_Version update only_

## 0.3.0
Tue, 16 Jan 2024 18:30:10 GMT

### Minor changes

- Add support for TypeScript 5.3

## 0.2.16
Wed, 03 Jan 2024 00:31:18 GMT

### Patches

- Fix break in watch mode during updateShapeSignature call.

## 0.2.15
Wed, 20 Dec 2023 01:09:46 GMT

_Version update only_

## 0.2.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 0.2.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 0.2.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 0.2.11
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 0.2.10
Mon, 30 Oct 2023 23:36:38 GMT

_Version update only_

## 0.2.9
Sun, 01 Oct 2023 02:56:30 GMT

_Version update only_

## 0.2.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 0.2.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 0.2.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 0.2.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 0.2.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.2.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 0.2.2
Fri, 22 Sep 2023 00:05:51 GMT

_Version update only_

## 0.2.1
Tue, 19 Sep 2023 15:21:51 GMT

_Version update only_

## 0.2.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

### Patches

- Fix bugs related to tracking of the current working directory if the value changes.

## 0.1.21
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.1.20
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.1.19
Thu, 20 Jul 2023 20:47:29 GMT

_Version update only_

## 0.1.18
Wed, 19 Jul 2023 00:20:31 GMT

### Patches

- Updated semver dependency

## 0.1.17
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.1.16
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 0.1.15
Wed, 12 Jul 2023 00:23:29 GMT

### Patches

- Only make warnings terminal if "buildProjectReferences" is true.

## 0.1.14
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 0.1.13
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.1.12
Tue, 04 Jul 2023 00:18:47 GMT

### Patches

- Fix evaluation of the "project" configuration option.

## 0.1.11
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.1.10
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.1.9
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.1.8
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.1.7
Tue, 13 Jun 2023 01:49:01 GMT

_Version update only_

## 0.1.6
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.1.5
Fri, 09 Jun 2023 00:19:49 GMT

### Patches

- Emit error if warnings are encountered when building in solution mode. This avoids confusion because the TypeScript compiler implicitly sets `noEmitOnError: true` when building in solution mode.

## 0.1.4
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.1.3
Thu, 08 Jun 2023 00:20:02 GMT

### Patches

- Use the temp folder instead of the cache folder.

## 0.1.2
Wed, 07 Jun 2023 22:45:16 GMT

_Version update only_

## 0.1.1
Mon, 05 Jun 2023 21:45:21 GMT

### Patches

- Fix resolution of relative tsconfig paths that start with './' or '../'.

## 0.1.0
Fri, 02 Jun 2023 02:01:12 GMT

### Minor changes

- Prepare for official release.

