# Change Log - @rushstack/heft-storybook-plugin

This log was last generated on Fri, 20 Feb 2026 16:14:49 GMT and should not be manually modified.

## 1.3.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 1.3.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.3.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 1.2.9
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.2.8
Thu, 05 Feb 2026 01:54:04 GMT

_Version update only_

## 1.2.7
Thu, 05 Feb 2026 00:23:59 GMT

_Version update only_

## 1.2.6
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.2.5
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.2.4
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.2.3
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.2.2
Wed, 07 Jan 2026 01:12:24 GMT

_Version update only_

## 1.2.1
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 1.2.0
Mon, 29 Dec 2025 16:12:51 GMT

### Minor changes

- Add support for Storybook v9
- Add support for serve mode with RSPack

## 1.1.8
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.1.7
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.1.6
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.1.5
Tue, 04 Nov 2025 08:15:14 GMT

_Version update only_

## 1.1.4
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 1.1.3
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 1.1.2
Fri, 17 Oct 2025 23:22:33 GMT

_Version update only_

## 1.1.1
Wed, 08 Oct 2025 00:13:28 GMT

_Version update only_

## 1.1.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 1.0.0
Tue, 30 Sep 2025 23:57:45 GMT

### Breaking changes

- Release Heft version 1.0.0

## 0.9.22
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.9.21
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.9.20
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.9.19
Fri, 29 Aug 2025 00:08:01 GMT

_Version update only_

## 0.9.18
Tue, 26 Aug 2025 00:12:57 GMT

_Version update only_

## 0.9.17
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.9.16
Fri, 01 Aug 2025 00:12:48 GMT

_Version update only_

## 0.9.15
Sat, 26 Jul 2025 00:12:22 GMT

_Version update only_

## 0.9.14
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.9.13
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.9.12
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.9.11
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.9.10
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.9.9
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.9.8
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.9.7
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 0.9.6
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 0.9.5
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 0.9.4
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 0.9.3
Tue, 25 Mar 2025 15:11:15 GMT

_Version update only_

## 0.9.2
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 0.9.1
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 0.9.0
Tue, 11 Mar 2025 02:12:33 GMT

### Minor changes

- Use `useNodeJSResolver: true` in `Import.resolvePackage` calls.

## 0.8.9
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.8.8
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.8.7
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.8.6
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 0.8.5
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.8.4
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.8.3
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.8.2
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.8.1
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.8.0
Thu, 16 Jan 2025 22:49:19 GMT

### Minor changes

- Add support for the `--docs` parameter.

## 0.7.7
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.7.6
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.7.5
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.7.4
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.7.3
Tue, 03 Dec 2024 16:11:07 GMT

_Version update only_

## 0.7.2
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.7.1
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.7.0
Fri, 25 Oct 2024 00:10:38 GMT

### Minor changes

- Add support for Storybook v8

## 0.6.52
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.6.51
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.6.50
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.6.49
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.6.48
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 0.6.47
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.6.46
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.6.45
Sat, 21 Sep 2024 00:10:27 GMT

_Version update only_

## 0.6.44
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.6.43
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.6.42
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.6.41
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.6.40
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.6.39
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.6.38
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 0.6.37
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 0.6.36
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.6.35
Tue, 16 Jul 2024 00:36:21 GMT

_Version update only_

## 0.6.34
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.6.33
Fri, 07 Jun 2024 15:10:25 GMT

_Version update only_

## 0.6.32
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.6.31
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.6.30
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 0.6.29
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.6.28
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.6.27
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.6.26
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.6.25
Fri, 24 May 2024 00:15:08 GMT

_Version update only_

## 0.6.24
Thu, 23 May 2024 02:26:56 GMT

### Patches

- Fix an edge case where the Storybook STDOUT might not be flushed completely when an error occurs

## 0.6.23
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.6.22
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.6.21
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.6.20
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.6.19
Wed, 08 May 2024 22:23:50 GMT

_Version update only_

## 0.6.18
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 0.6.17
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.6.16
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 0.6.15
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 0.6.14
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 0.6.13
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 0.6.12
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 0.6.11
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 0.6.10
Thu, 29 Feb 2024 07:11:45 GMT

_Version update only_

## 0.6.9
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 0.6.8
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.6.7
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 0.6.6
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.6.5
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 0.6.4
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.6.3
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 0.6.2
Mon, 19 Feb 2024 21:54:27 GMT

_Version update only_

## 0.6.1
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 0.6.0
Mon, 12 Feb 2024 16:09:54 GMT

### Minor changes

- Fix an issue where Webpack would run twice during static storybook builds.
- Introduce a `captureWebpackStats` configuration option that, when enabled, will pass the `--webpack-stats-json` parameter to Storybook.

## 0.5.3
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 0.5.2
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 0.5.1
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.5.0
Thu, 25 Jan 2024 01:09:29 GMT

### Minor changes

- Add support for storybook 7, HMR, and breaking chages in the plugin configuration option. The "startupModulePath" and "staticBuildModulePath" have been removed in favour of "cliCallingConvention" and "cliPackageName". A new 'cwdPackageName' option provides the ability to set an alternative dependency name as (cwd) target for the storybook commands.

## 0.4.19
Tue, 23 Jan 2024 20:12:57 GMT

_Version update only_

## 0.4.18
Tue, 23 Jan 2024 16:15:06 GMT

_Version update only_

## 0.4.17
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 0.4.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 0.4.15
Wed, 20 Dec 2023 01:09:45 GMT

_Version update only_

## 0.4.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 0.4.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 0.4.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 0.4.11
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 0.4.10
Mon, 30 Oct 2023 23:36:37 GMT

_Version update only_

## 0.4.9
Sun, 01 Oct 2023 02:56:29 GMT

_Version update only_

## 0.4.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 0.4.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 0.4.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 0.4.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 0.4.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.4.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 0.4.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 0.4.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 0.4.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 0.3.29
Wed, 13 Sep 2023 00:32:29 GMT

_Version update only_

## 0.3.28
Thu, 07 Sep 2023 03:35:43 GMT

_Version update only_

## 0.3.27
Sat, 12 Aug 2023 00:21:48 GMT

_Version update only_

## 0.3.26
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.3.25
Mon, 31 Jul 2023 15:19:05 GMT

_Version update only_

## 0.3.24
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.3.23
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 0.3.22
Wed, 19 Jul 2023 18:46:59 GMT

### Patches

- Run Storybook in a forked Node process, providing various advantages including isolation of the process and encapsulation of all console logging

## 0.3.21
Wed, 19 Jul 2023 00:20:31 GMT

_Version update only_

## 0.3.20
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 0.3.19
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.3.18
Wed, 12 Jul 2023 15:20:39 GMT

_Version update only_

## 0.3.17
Wed, 12 Jul 2023 00:23:29 GMT

_Version update only_

## 0.3.16
Fri, 07 Jul 2023 00:19:32 GMT

_Version update only_

## 0.3.15
Thu, 06 Jul 2023 00:16:19 GMT

_Version update only_

## 0.3.14
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 0.3.13
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.3.12
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.3.11
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.3.10
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.3.9
Tue, 13 Jun 2023 01:49:02 GMT

_Version update only_

## 0.3.8
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.3.7
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 0.3.6
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 0.3.5
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.3.4
Thu, 08 Jun 2023 00:20:02 GMT

_Version update only_

## 0.3.3
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 0.3.2
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 0.3.1
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 0.3.0
Fri, 02 Jun 2023 02:01:12 GMT

### Minor changes

- Refactor for multi-phase Heft. See @rushstack/heft/UPGRADING.md.

## 0.2.12
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.2.11
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 0.2.10
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 0.2.9
Thu, 04 May 2023 00:20:28 GMT

_Version update only_

## 0.2.8
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 0.2.7
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 0.2.6
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 0.2.5
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 0.2.4
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 0.2.3
Wed, 22 Feb 2023 16:26:55 GMT

### Patches

- Fix an issue where static build output ends up in the wrong folder.

## 0.2.2
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 0.2.1
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 0.2.0
Wed, 01 Feb 2023 02:16:34 GMT

### Minor changes

- Add support for storybook static build

## 0.1.99
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 0.1.98
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 0.1.97
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 0.1.96
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 0.1.95
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 0.1.94
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 0.1.93
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 0.1.92
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 0.1.91
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 0.1.90
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 0.1.89
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 0.1.88
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 0.1.87
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 0.1.86
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 0.1.85
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 0.1.84
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 0.1.83
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 0.1.82
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 0.1.81
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 0.1.80
Thu, 15 Sep 2022 00:18:51 GMT

_Version update only_

## 0.1.79
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 0.1.78
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 0.1.77
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 0.1.76
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 0.1.75
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 0.1.74
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 0.1.73
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 0.1.72
Fri, 19 Aug 2022 00:17:19 GMT

_Version update only_

## 0.1.71
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 0.1.70
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 0.1.69
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 0.1.68
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 0.1.67
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 0.1.66
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 0.1.65
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 0.1.64
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 0.1.63
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 0.1.62
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 0.1.61
Tue, 28 Jun 2022 22:47:14 GMT

_Version update only_

## 0.1.60
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 0.1.59
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 0.1.58
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 0.1.57
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 0.1.56
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 0.1.55
Thu, 23 Jun 2022 22:14:25 GMT

_Version update only_

## 0.1.54
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 0.1.53
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 0.1.52
Tue, 07 Jun 2022 09:37:05 GMT

_Version update only_

## 0.1.51
Wed, 25 May 2022 22:25:07 GMT

_Version update only_

## 0.1.50
Thu, 19 May 2022 15:13:20 GMT

_Version update only_

## 0.1.49
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 0.1.48
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 0.1.47
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 0.1.46
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 0.1.45
Sat, 23 Apr 2022 02:13:07 GMT

_Version update only_

## 0.1.44
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 0.1.43
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 0.1.42
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 0.1.41
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 0.1.40
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 0.1.39
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 0.1.38
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 0.1.37
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 0.1.36
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 0.1.35
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 0.1.34
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 0.1.33
Fri, 11 Feb 2022 10:30:25 GMT

_Version update only_

## 0.1.32
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 0.1.31
Fri, 21 Jan 2022 01:10:41 GMT

_Version update only_

## 0.1.30
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 0.1.29
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 0.1.28
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 0.1.27
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 0.1.26
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 0.1.25
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 0.1.24
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 0.1.23
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 0.1.22
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 0.1.21
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 0.1.20
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 0.1.19
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 0.1.18
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 0.1.17
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 0.1.16
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 0.1.15
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 0.1.14
Wed, 13 Oct 2021 15:09:54 GMT

_Version update only_

## 0.1.13
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 0.1.12
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 0.1.11
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 0.1.10
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 0.1.9
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 0.1.8
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 0.1.7
Tue, 05 Oct 2021 15:08:37 GMT

_Version update only_

## 0.1.6
Mon, 04 Oct 2021 15:10:18 GMT

### Patches

- Adopt new Heft RegisterParameter feature.

## 0.1.5
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 0.1.4
Thu, 23 Sep 2021 00:10:40 GMT

_Version update only_

## 0.1.3
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 0.1.2
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 0.1.1
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 0.1.0
Tue, 14 Sep 2021 01:17:04 GMT

### Minor changes

- Initial release

