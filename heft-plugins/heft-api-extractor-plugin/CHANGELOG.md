# Change Log - @rushstack/heft-api-extractor-plugin

This log was last generated on Fri, 20 Feb 2026 00:15:04 GMT and should not be manually modified.

## 1.3.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.3.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 1.2.10
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.2.9
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.2.8
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.2.7
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.2.6
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.2.5
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 1.2.4
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 1.2.3
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.2.2
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.2.1
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.2.0
Tue, 04 Nov 2025 08:15:14 GMT

### Minor changes

- Include a `printApiReportDiff` option in the `config/api-extractor-task.json` config file that, when set to `"production"` (and the `--production` flag is specified) or `"always"`, causes a diff of the API report (*.api.md) to be printed if the report is changed. This is useful for diagnosing issues that only show up in CI.

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

## 0.4.14
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.4.13
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.4.12
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.4.11
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.4.10
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 0.4.9
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.4.8
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.4.7
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.4.6
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.4.5
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.4.4
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.4.3
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.4.2
Thu, 17 Apr 2025 00:11:21 GMT

### Patches

- Update documentation for `extends`

## 0.4.1
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 0.4.0
Wed, 09 Apr 2025 00:11:02 GMT

### Minor changes

- Use `tryLoadProjectConfigurationFileAsync` Heft API to remove direct dependency on `@rushstack/heft-config-file`.

## 0.3.77
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 0.3.76
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 0.3.75
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 0.3.74
Wed, 12 Mar 2025 00:11:31 GMT

_Version update only_

## 0.3.73
Tue, 11 Mar 2025 02:12:33 GMT

_Version update only_

## 0.3.72
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.3.71
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.3.70
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.3.69
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 0.3.68
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.3.67
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.3.66
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.3.65
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.3.64
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.3.63
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.3.62
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.3.61
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.3.60
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.3.59
Tue, 03 Dec 2024 16:11:07 GMT

_Version update only_

## 0.3.58
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.3.57
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.3.56
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.3.55
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.3.54
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.3.53
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.3.52
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 0.3.51
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.3.50
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.3.49
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.3.48
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.3.47
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.3.46
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.3.45
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.3.44
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.3.43
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 0.3.42
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 0.3.41
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.3.40
Tue, 16 Jul 2024 00:36:21 GMT

_Version update only_

## 0.3.39
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.3.38
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.3.37
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.3.36
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 0.3.35
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.3.34
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.3.33
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.3.32
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.3.31
Fri, 24 May 2024 00:15:08 GMT

_Version update only_

## 0.3.30
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.3.29
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.3.28
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.3.27
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.3.26
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.3.25
Wed, 08 May 2024 22:23:50 GMT

_Version update only_

## 0.3.24
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 0.3.23
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.3.22
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

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
Thu, 29 Feb 2024 07:11:45 GMT

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

_Version update only_

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
Mon, 30 Oct 2023 23:36:37 GMT

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
- Add "runInWatchMode" task configuration flag to support invocation when Heft is in watch mode. Does not currently offer any performance benefit.

## 0.1.18
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.1.17
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.1.16
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 0.1.15
Wed, 19 Jul 2023 00:20:31 GMT

### Patches

- Updated semver dependency

## 0.1.14
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.1.13
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 0.1.12
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 0.1.11
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.1.10
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.1.9
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.1.8
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.1.7
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.1.6
Tue, 13 Jun 2023 01:49:01 GMT

_Version update only_

## 0.1.5
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.1.4
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 0.1.3
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.1.2
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 0.1.1
Wed, 07 Jun 2023 22:45:16 GMT

_Version update only_

## 0.1.0
Fri, 02 Jun 2023 02:01:12 GMT

### Minor changes

- Prepare for official release.

