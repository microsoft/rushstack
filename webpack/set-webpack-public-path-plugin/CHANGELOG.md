# Change Log - @rushstack/set-webpack-public-path-plugin

This log was last generated on Wed, 25 Feb 2026 21:39:42 GMT and should not be manually modified.

## 5.3.7
Wed, 25 Feb 2026 21:39:42 GMT

_Version update only_

## 5.3.6
Wed, 25 Feb 2026 00:34:30 GMT

_Version update only_

## 5.3.5
Tue, 24 Feb 2026 01:13:27 GMT

_Version update only_

## 5.3.4
Mon, 23 Feb 2026 00:42:21 GMT

_Version update only_

## 5.3.3
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 5.3.2
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 5.3.1
Thu, 19 Feb 2026 01:30:06 GMT

_Version update only_

## 5.3.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 5.2.15
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 5.2.14
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 5.2.13
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 5.2.12
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 5.2.11
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 5.2.10
Wed, 07 Jan 2026 01:12:24 GMT

_Version update only_

## 5.2.9
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 5.2.8
Thu, 18 Dec 2025 01:13:04 GMT

### Patches

- Fix support for newer webpack typings.

## 5.2.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 5.2.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 5.2.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 5.2.4
Tue, 04 Nov 2025 08:15:15 GMT

_Version update only_

## 5.2.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 5.2.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 5.2.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 5.2.0
Fri, 03 Oct 2025 20:10:00 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 5.1.94
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 5.1.93
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 5.1.92
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 5.1.91
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 5.1.90
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 5.1.89
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 5.1.88
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 5.1.87
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 5.1.86
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 5.1.85
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 5.1.84
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 5.1.83
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 5.1.82
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 5.1.81
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 5.1.80
Tue, 15 Apr 2025 15:11:58 GMT

_Version update only_

## 5.1.79
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 5.1.78
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 5.1.77
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 5.1.76
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 5.1.75
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 5.1.74
Tue, 11 Mar 2025 02:12:34 GMT

_Version update only_

## 5.1.73
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 5.1.72
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 5.1.71
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 5.1.70
Wed, 26 Feb 2025 16:11:12 GMT

_Version update only_

## 5.1.69
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 5.1.68
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 5.1.67
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 5.1.66
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 5.1.65
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 5.1.64
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 5.1.63
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 5.1.62
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 5.1.61
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 5.1.60
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 5.1.59
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 5.1.58
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 5.1.57
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 5.1.56
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 5.1.55
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 5.1.54
Tue, 15 Oct 2024 00:12:32 GMT

_Version update only_

## 5.1.53
Wed, 02 Oct 2024 00:11:19 GMT

### Patches

- Ensure compatibility with webpack 5.95.0

## 5.1.52
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 5.1.51
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 5.1.50
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 5.1.49
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 5.1.48
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 5.1.47
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 5.1.46
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 5.1.45
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 5.1.44
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 5.1.43
Wed, 17 Jul 2024 06:55:10 GMT

_Version update only_

## 5.1.42
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 5.1.41
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 5.1.40
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 5.1.39
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 5.1.38
Thu, 30 May 2024 00:13:05 GMT

### Patches

- Include missing `type` modifiers on type-only exports.

## 5.1.37
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 5.1.36
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 5.1.35
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 5.1.34
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 5.1.33
Sat, 25 May 2024 04:54:08 GMT

_Version update only_

## 5.1.32
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 5.1.31
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 5.1.30
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 5.1.29
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 5.1.28
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 5.1.27
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 5.1.26
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 5.1.25
Mon, 06 May 2024 15:11:05 GMT

_Version update only_

## 5.1.24
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 5.1.23
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 5.1.22
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 5.1.21
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 5.1.20
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 5.1.19
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 5.1.18
Fri, 01 Mar 2024 01:10:09 GMT

_Version update only_

## 5.1.17
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 5.1.16
Wed, 28 Feb 2024 16:09:28 GMT

_Version update only_

## 5.1.15
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 5.1.14
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 5.1.13
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 5.1.12
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 5.1.11
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 5.1.10
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 5.1.9
Mon, 19 Feb 2024 21:54:27 GMT

_Version update only_

## 5.1.8
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 5.1.7
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 5.1.6
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 5.1.5
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 5.1.4
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 5.1.3
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 5.1.2
Tue, 23 Jan 2024 16:15:06 GMT

_Version update only_

## 5.1.1
Thu, 18 Jan 2024 05:07:01 GMT

### Patches

- Only emit an error about unsupported library types if the public path is actually used.

## 5.1.0
Thu, 18 Jan 2024 03:30:10 GMT

### Minor changes

- Add a second exported plugin (`SetPublicPathCurrentScriptPlugin`) that creates a wrapper around the runtime chunk and uses the `document.currentScript` API to get the current script's URL.

## 5.0.1
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 5.0.0
Fri, 12 Jan 2024 01:23:10 GMT

### Breaking changes

- Update the plugin to work with Webpack 5 and drop support for Webpack 4.
- Remove old options, specifically `systemJs`, `urlPrefix`, `publicPath`, and `skipDetection`.

## 4.1.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 4.1.15
Wed, 20 Dec 2023 01:09:45 GMT

_Version update only_

## 4.1.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 4.1.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 4.1.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 4.1.11
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 4.1.10
Mon, 30 Oct 2023 23:36:37 GMT

_Version update only_

## 4.1.9
Sun, 01 Oct 2023 02:56:30 GMT

_Version update only_

## 4.1.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 4.1.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 4.1.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 4.1.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 4.1.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 4.1.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 4.1.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 4.1.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 4.1.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 4.0.17
Wed, 13 Sep 2023 00:32:29 GMT

_Version update only_

## 4.0.16
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 4.0.15
Mon, 31 Jul 2023 15:19:06 GMT

_Version update only_

## 4.0.14
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 4.0.13
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 4.0.12
Wed, 19 Jul 2023 00:20:31 GMT

_Version update only_

## 4.0.11
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 4.0.10
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 4.0.9
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 4.0.8
Wed, 12 Jul 2023 00:23:29 GMT

_Version update only_

## 4.0.7
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 4.0.6
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 4.0.5
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 4.0.4
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 4.0.3
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 4.0.2
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 4.0.1
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 4.0.0
Tue, 13 Jun 2023 01:49:01 GMT

### Breaking changes

- Emit an error on Webpack 5 instead of a warning and remove the optional peerDependency on Webpack.

## 3.3.115
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 3.3.114
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 3.3.113
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 3.3.112
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 3.3.111
Thu, 08 Jun 2023 00:20:02 GMT

_Version update only_

## 3.3.110
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 3.3.109
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 3.3.108
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 3.3.107
Fri, 02 Jun 2023 02:01:12 GMT

_Version update only_

## 3.3.106
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 3.3.105
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 3.3.104
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 3.3.103
Thu, 04 May 2023 00:20:28 GMT

_Version update only_

## 3.3.102
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 3.3.101
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 3.3.100
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 3.3.99
Thu, 20 Apr 2023 15:16:55 GMT

_Version update only_

## 3.3.98
Tue, 11 Apr 2023 00:23:22 GMT

_Version update only_

## 3.3.97
Fri, 07 Apr 2023 22:19:21 GMT

_Version update only_

## 3.3.96
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 3.3.95
Thu, 23 Mar 2023 15:24:08 GMT

_Version update only_

## 3.3.94
Wed, 22 Mar 2023 20:48:30 GMT

_Version update only_

## 3.3.93
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 3.3.92
Sat, 11 Mar 2023 01:24:51 GMT

_Version update only_

## 3.3.91
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 3.3.90
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 3.3.89
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 3.3.88
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 3.3.87
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 3.3.86
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 3.3.85
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 3.3.84
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 3.3.83
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 3.3.82
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 3.3.81
Fri, 02 Dec 2022 01:15:42 GMT

_Version update only_

## 3.3.80
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 3.3.79
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 3.3.78
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 3.3.77
Tue, 25 Oct 2022 00:20:44 GMT

_Version update only_

## 3.3.76
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 3.3.75
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 3.3.74
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 3.3.73
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 3.3.72
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 3.3.71
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 3.3.70
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 3.3.69
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 3.3.68
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 3.3.67
Thu, 15 Sep 2022 00:18:52 GMT

_Version update only_

## 3.3.66
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 3.3.65
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 3.3.64
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 3.3.63
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 3.3.62
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 3.3.61
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 3.3.60
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 3.3.59
Fri, 19 Aug 2022 00:17:19 GMT

_Version update only_

## 3.3.58
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 3.3.57
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 3.3.56
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 3.3.55
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 3.3.54
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 3.3.53
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 3.3.52
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 3.3.51
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 3.3.50
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 3.3.49
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 3.3.48
Tue, 28 Jun 2022 22:47:14 GMT

_Version update only_

## 3.3.47
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 3.3.46
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 3.3.45
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 3.3.44
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 3.3.43
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 3.3.42
Thu, 23 Jun 2022 22:14:25 GMT

_Version update only_

## 3.3.41
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 3.3.40
Fri, 17 Jun 2022 00:16:18 GMT

### Patches

- Bump @types/webpack

## 3.3.39
Tue, 07 Jun 2022 09:37:05 GMT

_Version update only_

## 3.3.38
Wed, 25 May 2022 22:25:07 GMT

_Version update only_

## 3.3.37
Thu, 19 May 2022 15:13:20 GMT

_Version update only_

## 3.3.36
Wed, 18 May 2022 15:10:56 GMT

_Version update only_

## 3.3.35
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 3.3.34
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 3.3.33
Fri, 06 May 2022 18:54:42 GMT

_Version update only_

## 3.3.32
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 3.3.31
Wed, 04 May 2022 02:35:33 GMT

### Patches

- Make @rushstack/webpack-plugin-utilities a normal dependency.

## 3.3.30
Wed, 27 Apr 2022 01:19:20 GMT

### Patches

- Move webpack version detection logic to the "@rushstack/webpack-plugin-utilities" package

## 3.3.29
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 3.3.28
Sat, 23 Apr 2022 02:13:07 GMT

_Version update only_

## 3.3.27
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 3.3.26
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 3.3.25
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 3.3.24
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 3.3.23
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 3.3.22
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 3.3.21
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 3.3.20
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 3.3.19
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 3.3.18
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 3.3.17
Tue, 15 Mar 2022 19:15:54 GMT

_Version update only_

## 3.3.16
Fri, 11 Feb 2022 10:30:25 GMT

_Version update only_

## 3.3.15
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 3.3.14
Fri, 21 Jan 2022 01:10:41 GMT

_Version update only_

## 3.3.13
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 3.3.12
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 3.3.11
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 3.3.10
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 3.3.9
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 3.3.8
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 3.3.7
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 3.3.6
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 3.3.5
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 3.3.4
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 3.3.3
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 3.3.2
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 3.3.1
Thu, 11 Nov 2021 01:17:02 GMT

### Patches

- Update typings to only import from "webpack."

## 3.3.0
Wed, 10 Nov 2021 16:09:47 GMT

### Minor changes

- Introduce a warning when running in Webpack 5.

## 3.2.90
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 3.2.89
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 3.2.88
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 3.2.87
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 3.2.86
Wed, 13 Oct 2021 15:09:55 GMT

_Version update only_

## 3.2.85
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 3.2.84
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 3.2.83
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 3.2.82
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 3.2.81
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 3.2.80
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 3.2.79
Tue, 05 Oct 2021 15:08:38 GMT

_Version update only_

## 3.2.78
Mon, 04 Oct 2021 15:10:18 GMT

_Version update only_

## 3.2.77
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 3.2.76
Thu, 23 Sep 2021 00:10:41 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 3.2.75
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 3.2.74
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 3.2.73
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 3.2.72
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 3.2.71
Mon, 13 Sep 2021 15:07:05 GMT

_Version update only_

## 3.2.70
Fri, 10 Sep 2021 15:08:28 GMT

_Version update only_

## 3.2.69
Wed, 08 Sep 2021 19:06:22 GMT

_Version update only_

## 3.2.68
Wed, 08 Sep 2021 00:08:03 GMT

_Version update only_

## 3.2.67
Fri, 03 Sep 2021 00:09:10 GMT

_Version update only_

## 3.2.66
Tue, 31 Aug 2021 00:07:11 GMT

_Version update only_

## 3.2.65
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 3.2.64
Fri, 20 Aug 2021 15:08:10 GMT

_Version update only_

## 3.2.63
Fri, 13 Aug 2021 00:09:14 GMT

_Version update only_

## 3.2.62
Thu, 12 Aug 2021 18:11:18 GMT

_Version update only_

## 3.2.61
Thu, 12 Aug 2021 01:28:38 GMT

_Version update only_

## 3.2.60
Wed, 11 Aug 2021 23:14:17 GMT

_Version update only_

## 3.2.59
Wed, 11 Aug 2021 00:07:21 GMT

_Version update only_

## 3.2.58
Sat, 31 Jul 2021 00:52:11 GMT

_Version update only_

## 3.2.57
Wed, 14 Jul 2021 15:06:29 GMT

_Version update only_

## 3.2.56
Tue, 13 Jul 2021 23:00:33 GMT

_Version update only_

## 3.2.55
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 3.2.54
Thu, 08 Jul 2021 23:41:17 GMT

_Version update only_

## 3.2.53
Thu, 08 Jul 2021 06:00:48 GMT

_Version update only_

## 3.2.52
Thu, 01 Jul 2021 15:08:27 GMT

_Version update only_

## 3.2.51
Wed, 30 Jun 2021 19:16:19 GMT

_Version update only_

## 3.2.50
Wed, 30 Jun 2021 15:06:54 GMT

_Version update only_

## 3.2.49
Wed, 30 Jun 2021 01:37:17 GMT

_Version update only_

## 3.2.48
Fri, 25 Jun 2021 00:08:28 GMT

_Version update only_

## 3.2.47
Fri, 18 Jun 2021 06:23:05 GMT

_Version update only_

## 3.2.46
Wed, 16 Jun 2021 18:53:52 GMT

_Version update only_

## 3.2.45
Wed, 16 Jun 2021 15:07:24 GMT

_Version update only_

## 3.2.44
Tue, 15 Jun 2021 20:38:35 GMT

_Version update only_

## 3.2.43
Fri, 11 Jun 2021 23:26:16 GMT

_Version update only_

## 3.2.42
Fri, 11 Jun 2021 00:34:02 GMT

_Version update only_

## 3.2.41
Thu, 10 Jun 2021 15:08:16 GMT

_Version update only_

## 3.2.40
Fri, 04 Jun 2021 19:59:53 GMT

_Version update only_

## 3.2.39
Fri, 04 Jun 2021 15:08:20 GMT

_Version update only_

## 3.2.38
Fri, 04 Jun 2021 00:08:34 GMT

_Version update only_

## 3.2.37
Tue, 01 Jun 2021 18:29:26 GMT

_Version update only_

## 3.2.36
Sat, 29 May 2021 01:05:06 GMT

_Version update only_

## 3.2.35
Fri, 28 May 2021 06:19:58 GMT

_Version update only_

## 3.2.34
Tue, 25 May 2021 00:12:21 GMT

_Version update only_

## 3.2.33
Wed, 19 May 2021 00:11:39 GMT

_Version update only_

## 3.2.32
Thu, 13 May 2021 01:52:47 GMT

_Version update only_

## 3.2.31
Tue, 11 May 2021 22:19:17 GMT

_Version update only_

## 3.2.30
Mon, 03 May 2021 15:10:28 GMT

_Version update only_

## 3.2.29
Thu, 29 Apr 2021 23:26:50 GMT

_Version update only_

## 3.2.28
Thu, 29 Apr 2021 01:07:29 GMT

_Version update only_

## 3.2.27
Fri, 23 Apr 2021 22:00:07 GMT

_Version update only_

## 3.2.26
Fri, 23 Apr 2021 15:11:21 GMT

_Version update only_

## 3.2.25
Wed, 21 Apr 2021 15:12:28 GMT

_Version update only_

## 3.2.24
Tue, 20 Apr 2021 04:59:51 GMT

_Version update only_

## 3.2.23
Thu, 15 Apr 2021 02:59:25 GMT

_Version update only_

## 3.2.22
Mon, 12 Apr 2021 15:10:29 GMT

_Version update only_

## 3.2.21
Thu, 08 Apr 2021 20:41:55 GMT

_Version update only_

## 3.2.20
Thu, 08 Apr 2021 06:05:32 GMT

_Version update only_

## 3.2.19
Thu, 08 Apr 2021 00:10:18 GMT

_Version update only_

## 3.2.18
Tue, 06 Apr 2021 15:14:22 GMT

_Version update only_

## 3.2.17
Wed, 31 Mar 2021 15:10:36 GMT

_Version update only_

## 3.2.16
Mon, 29 Mar 2021 05:02:07 GMT

_Version update only_

## 3.2.15
Fri, 19 Mar 2021 22:31:38 GMT

_Version update only_

## 3.2.14
Wed, 17 Mar 2021 05:04:38 GMT

_Version update only_

## 3.2.13
Fri, 12 Mar 2021 01:13:27 GMT

_Version update only_

## 3.2.12
Wed, 10 Mar 2021 06:23:29 GMT

_Version update only_

## 3.2.11
Wed, 10 Mar 2021 05:10:06 GMT

_Version update only_

## 3.2.10
Thu, 04 Mar 2021 01:11:31 GMT

_Version update only_

## 3.2.9
Tue, 02 Mar 2021 23:25:05 GMT

_Version update only_

## 3.2.8
Fri, 05 Feb 2021 16:10:42 GMT

_Version update only_

## 3.2.7
Fri, 22 Jan 2021 05:39:22 GMT

_Version update only_

## 3.2.6
Thu, 21 Jan 2021 04:19:01 GMT

_Version update only_

## 3.2.5
Wed, 13 Jan 2021 01:11:06 GMT

_Version update only_

## 3.2.4
Fri, 08 Jan 2021 07:28:50 GMT

_Version update only_

## 3.2.3
Wed, 06 Jan 2021 16:10:43 GMT

_Version update only_

## 3.2.2
Mon, 14 Dec 2020 16:12:21 GMT

_Version update only_

## 3.2.1
Thu, 10 Dec 2020 23:25:50 GMT

_Version update only_

## 3.2.0
Tue, 08 Dec 2020 01:10:30 GMT

### Minor changes

- Remove uglify dependency and make suffix script always minified.

## 3.1.19
Sat, 05 Dec 2020 01:11:23 GMT

_Version update only_

## 3.1.18
Tue, 01 Dec 2020 01:10:38 GMT

_Version update only_

## 3.1.17
Mon, 30 Nov 2020 16:11:50 GMT

_Version update only_

## 3.1.16
Wed, 18 Nov 2020 08:19:54 GMT

_Version update only_

## 3.1.15
Wed, 18 Nov 2020 06:21:58 GMT

_Version update only_

## 3.1.14
Tue, 17 Nov 2020 01:17:38 GMT

_Version update only_

## 3.1.13
Mon, 16 Nov 2020 01:57:58 GMT

_Version update only_

## 3.1.12
Fri, 13 Nov 2020 01:11:01 GMT

_Version update only_

## 3.1.11
Thu, 12 Nov 2020 01:11:10 GMT

_Version update only_

## 3.1.10
Wed, 11 Nov 2020 01:08:58 GMT

_Version update only_

## 3.1.9
Tue, 10 Nov 2020 23:13:12 GMT

_Version update only_

## 3.1.8
Tue, 10 Nov 2020 16:11:42 GMT

_Version update only_

## 3.1.7
Sun, 08 Nov 2020 22:52:49 GMT

_Version update only_

## 3.1.6
Fri, 06 Nov 2020 16:09:30 GMT

_Version update only_

## 3.1.5
Tue, 03 Nov 2020 01:11:19 GMT

_Version update only_

## 3.1.4
Mon, 02 Nov 2020 16:12:05 GMT

_Version update only_

## 3.1.3
Fri, 30 Oct 2020 06:38:39 GMT

_Version update only_

## 3.1.2
Fri, 30 Oct 2020 00:10:14 GMT

_Version update only_

## 3.1.1
Thu, 29 Oct 2020 06:14:19 GMT

_Version update only_

## 3.1.0
Thu, 29 Oct 2020 00:11:33 GMT

### Minor changes

- Update Webpack dependency to ~4.44.2

## 3.0.18
Wed, 28 Oct 2020 01:18:03 GMT

_Version update only_

## 3.0.17
Tue, 27 Oct 2020 15:10:14 GMT

_Version update only_

## 3.0.16
Sat, 24 Oct 2020 00:11:19 GMT

_Version update only_

## 3.0.15
Wed, 21 Oct 2020 05:09:44 GMT

_Version update only_

## 3.0.14
Wed, 21 Oct 2020 02:28:17 GMT

_Version update only_

## 3.0.13
Fri, 16 Oct 2020 23:32:58 GMT

_Version update only_

## 3.0.12
Thu, 15 Oct 2020 00:59:08 GMT

_Version update only_

## 3.0.11
Wed, 14 Oct 2020 23:30:14 GMT

_Version update only_

## 3.0.10
Tue, 13 Oct 2020 15:11:28 GMT

_Version update only_

## 3.0.9
Mon, 12 Oct 2020 15:11:16 GMT

_Version update only_

## 3.0.8
Fri, 09 Oct 2020 15:11:09 GMT

_Version update only_

## 3.0.7
Tue, 06 Oct 2020 00:24:06 GMT

_Version update only_

## 3.0.6
Mon, 05 Oct 2020 22:36:57 GMT

_Version update only_

## 3.0.5
Mon, 05 Oct 2020 15:10:43 GMT

_Version update only_

## 3.0.4
Fri, 02 Oct 2020 00:10:59 GMT

_Version update only_

## 3.0.3
Thu, 01 Oct 2020 20:27:16 GMT

_Version update only_

## 3.0.2
Thu, 01 Oct 2020 18:51:21 GMT

_Version update only_

## 3.0.1
Wed, 30 Sep 2020 18:39:17 GMT

_Version update only_

## 3.0.0
Wed, 30 Sep 2020 06:53:53 GMT

### Breaking changes

- Drop support for Webpack 3.

### Patches

- Update README.md

## 2.4.65
Tue, 22 Sep 2020 05:45:57 GMT

_Version update only_

## 2.4.64
Tue, 22 Sep 2020 01:45:31 GMT

_Version update only_

## 2.4.63
Tue, 22 Sep 2020 00:08:53 GMT

_Version update only_

## 2.4.62
Sat, 19 Sep 2020 04:37:27 GMT

_Version update only_

## 2.4.61
Sat, 19 Sep 2020 03:33:07 GMT

_Version update only_

## 2.4.60
Fri, 18 Sep 2020 22:57:24 GMT

_Version update only_

## 2.4.59
Fri, 18 Sep 2020 21:49:54 GMT

_Version update only_

## 2.4.58
Wed, 16 Sep 2020 05:30:26 GMT

_Version update only_

## 2.4.57
Tue, 15 Sep 2020 01:51:37 GMT

_Version update only_

## 2.4.56
Mon, 14 Sep 2020 15:09:49 GMT

_Version update only_

## 2.4.55
Sun, 13 Sep 2020 01:53:20 GMT

_Version update only_

## 2.4.54
Fri, 11 Sep 2020 02:13:35 GMT

_Version update only_

## 2.4.53
Wed, 09 Sep 2020 03:29:01 GMT

_Version update only_

## 2.4.52
Wed, 09 Sep 2020 00:38:48 GMT

_Version update only_

## 2.4.51
Mon, 07 Sep 2020 07:37:37 GMT

_Version update only_

## 2.4.50
Sat, 05 Sep 2020 18:56:35 GMT

_Version update only_

## 2.4.49
Fri, 04 Sep 2020 15:06:28 GMT

_Version update only_

## 2.4.48
Thu, 03 Sep 2020 15:09:59 GMT

_Version update only_

## 2.4.47
Wed, 02 Sep 2020 23:01:13 GMT

_Version update only_

## 2.4.46
Wed, 02 Sep 2020 15:10:17 GMT

_Version update only_

## 2.4.45
Thu, 27 Aug 2020 11:27:06 GMT

_Version update only_

## 2.4.44
Tue, 25 Aug 2020 00:10:12 GMT

_Version update only_

## 2.4.43
Mon, 24 Aug 2020 07:35:21 GMT

_Version update only_

## 2.4.42
Sat, 22 Aug 2020 05:55:43 GMT

_Version update only_

## 2.4.41
Fri, 21 Aug 2020 01:21:18 GMT

_Version update only_

## 2.4.40
Thu, 20 Aug 2020 18:41:47 GMT

_Version update only_

## 2.4.39
Thu, 20 Aug 2020 15:13:53 GMT

_Version update only_

## 2.4.38
Tue, 18 Aug 2020 23:59:42 GMT

_Version update only_

## 2.4.37
Tue, 18 Aug 2020 03:03:24 GMT

_Version update only_

## 2.4.36
Mon, 17 Aug 2020 05:31:53 GMT

_Version update only_

## 2.4.35
Mon, 17 Aug 2020 04:53:23 GMT

_Version update only_

## 2.4.34
Thu, 13 Aug 2020 09:26:40 GMT

_Version update only_

## 2.4.33
Thu, 13 Aug 2020 04:57:38 GMT

_Version update only_

## 2.4.32
Wed, 12 Aug 2020 00:10:05 GMT

### Patches

- Updated project to build with Heft

## 2.4.31
Wed, 05 Aug 2020 18:27:32 GMT

_Version update only_

## 2.4.30
Wed, 15 Jul 2020 15:09:42 GMT

### Patches

- Fix specification of optional peerDependencies.

## 2.4.29
Fri, 03 Jul 2020 15:09:04 GMT

_Version update only_

## 2.4.28
Fri, 03 Jul 2020 05:46:42 GMT

_Version update only_

## 2.4.27
Sat, 27 Jun 2020 00:09:38 GMT

_Version update only_

## 2.4.26
Fri, 26 Jun 2020 22:16:39 GMT

_Version update only_

## 2.4.25
Thu, 25 Jun 2020 06:43:35 GMT

_Version update only_

## 2.4.24
Wed, 24 Jun 2020 09:50:48 GMT

_Version update only_

## 2.4.23
Wed, 24 Jun 2020 09:04:28 GMT

_Version update only_

## 2.4.22
Mon, 15 Jun 2020 22:17:18 GMT

_Version update only_

## 2.4.21
Fri, 12 Jun 2020 09:19:21 GMT

_Version update only_

## 2.4.20
Wed, 10 Jun 2020 20:48:30 GMT

_Version update only_

## 2.4.19
Mon, 01 Jun 2020 08:34:17 GMT

_Version update only_

## 2.4.18
Sat, 30 May 2020 02:59:54 GMT

_Version update only_

## 2.4.17
Thu, 28 May 2020 05:59:02 GMT

_Version update only_

## 2.4.16
Wed, 27 May 2020 05:15:11 GMT

_Version update only_

## 2.4.15
Tue, 26 May 2020 23:00:25 GMT

_Version update only_

## 2.4.14
Fri, 22 May 2020 15:08:42 GMT

_Version update only_

## 2.4.13
Thu, 21 May 2020 23:09:44 GMT

_Version update only_

## 2.4.12
Thu, 21 May 2020 15:42:00 GMT

_Version update only_

## 2.4.11
Tue, 19 May 2020 15:08:20 GMT

_Version update only_

## 2.4.10
Fri, 15 May 2020 08:10:59 GMT

_Version update only_

## 2.4.9
Wed, 06 May 2020 08:23:45 GMT

_Version update only_

## 2.4.8
Sat, 02 May 2020 00:08:16 GMT

_Version update only_

## 2.4.7
Wed, 08 Apr 2020 04:07:33 GMT

_Version update only_

## 2.4.6
Mon, 06 Apr 2020 05:52:56 GMT

### Patches

- Fix an issue where sourcemaps with inlined sources can contain incorrect escaping.

## 2.4.5
Fri, 03 Apr 2020 15:10:15 GMT

_Version update only_

## 2.4.4
Sun, 29 Mar 2020 00:04:12 GMT

_Version update only_

## 2.4.3
Sat, 28 Mar 2020 00:37:16 GMT

_Version update only_

## 2.4.2
Wed, 18 Mar 2020 15:07:47 GMT

_Version update only_

## 2.4.1
Tue, 17 Mar 2020 23:55:58 GMT

### Patches

- PACKAGE NAME CHANGE: The NPM scope was changed from `@microsoft/set-webpack-public-path-plugin` to `@rushstack/set-webpack-public-path-plugin`

## 2.4.0
Tue, 04 Feb 2020 16:08:20 GMT

### Minor changes

- Add functionality to use the webpack-produced asset name to find the loaded acript.

## 2.3.4
Tue, 28 Jan 2020 02:23:44 GMT

_Version update only_

## 2.3.3
Fri, 24 Jan 2020 00:27:39 GMT

_Version update only_

## 2.3.2
Thu, 23 Jan 2020 01:07:56 GMT

_Version update only_

## 2.3.1
Tue, 21 Jan 2020 21:56:14 GMT

_Version update only_

## 2.3.0
Sun, 19 Jan 2020 02:26:52 GMT

### Minor changes

- Upgrade Node typings to Node 10

## 2.2.23
Fri, 17 Jan 2020 01:08:23 GMT

_Version update only_

## 2.2.22
Tue, 14 Jan 2020 01:34:16 GMT

_Version update only_

## 2.2.21
Sat, 11 Jan 2020 05:18:24 GMT

_Version update only_

## 2.2.20
Thu, 09 Jan 2020 06:44:13 GMT

_Version update only_

## 2.2.19
Wed, 08 Jan 2020 00:11:31 GMT

_Version update only_

## 2.2.18
Wed, 04 Dec 2019 23:17:55 GMT

_Version update only_

## 2.2.17
Tue, 03 Dec 2019 03:17:44 GMT

_Version update only_

## 2.2.16
Sun, 24 Nov 2019 00:54:04 GMT

_Version update only_

## 2.2.15
Wed, 20 Nov 2019 06:14:28 GMT

### Patches

- Convert `@types/webpack` to a peer dependency

## 2.2.14
Fri, 15 Nov 2019 04:50:50 GMT

_Version update only_

## 2.2.13
Mon, 11 Nov 2019 16:07:56 GMT

_Version update only_

## 2.2.12
Wed, 06 Nov 2019 22:44:18 GMT

_Version update only_

## 2.2.11
Tue, 05 Nov 2019 06:49:29 GMT

_Version update only_

## 2.2.10
Tue, 05 Nov 2019 01:08:39 GMT

_Version update only_

## 2.2.9
Fri, 25 Oct 2019 15:08:55 GMT

_Version update only_

## 2.2.8
Tue, 22 Oct 2019 06:24:44 GMT

_Version update only_

## 2.2.7
Mon, 21 Oct 2019 05:22:43 GMT

_Version update only_

## 2.2.6
Fri, 18 Oct 2019 15:15:01 GMT

_Version update only_

## 2.2.5
Sun, 06 Oct 2019 00:27:40 GMT

_Version update only_

## 2.2.4
Fri, 04 Oct 2019 00:15:22 GMT

_Version update only_

## 2.2.3
Sun, 29 Sep 2019 23:56:29 GMT

### Patches

- Update repository URL

## 2.2.2
Wed, 25 Sep 2019 15:15:31 GMT

_Version update only_

## 2.2.1
Tue, 24 Sep 2019 02:58:49 GMT

_Version update only_

## 2.2.0
Mon, 23 Sep 2019 15:14:55 GMT

### Minor changes

- Remove unnecessary dependencies on @types/node and @types/tapable

## 2.1.135
Fri, 20 Sep 2019 21:27:22 GMT

_Version update only_

## 2.1.134
Wed, 11 Sep 2019 19:56:23 GMT

_Version update only_

## 2.1.133
Tue, 10 Sep 2019 22:32:23 GMT

_Version update only_

## 2.1.132
Tue, 10 Sep 2019 20:38:33 GMT

_Version update only_

## 2.1.131
Wed, 04 Sep 2019 18:28:06 GMT

_Version update only_

## 2.1.130
Wed, 04 Sep 2019 15:15:37 GMT

_Version update only_

## 2.1.129
Wed, 04 Sep 2019 01:43:31 GMT

### Patches

- Make @types/webpack dependency more loose.

## 2.1.128
Fri, 30 Aug 2019 00:14:32 GMT

_Version update only_

## 2.1.127
Mon, 12 Aug 2019 15:15:14 GMT

_Version update only_

## 2.1.126
Thu, 08 Aug 2019 15:14:17 GMT

_Version update only_

## 2.1.125
Thu, 08 Aug 2019 00:49:06 GMT

_Version update only_

## 2.1.124
Mon, 05 Aug 2019 22:04:32 GMT

### Patches

- Security updates.

## 2.1.123
Tue, 23 Jul 2019 19:14:38 GMT

_Version update only_

## 2.1.122
Tue, 23 Jul 2019 01:13:01 GMT

_Version update only_

## 2.1.121
Mon, 22 Jul 2019 19:13:10 GMT

_Version update only_

## 2.1.120
Fri, 12 Jul 2019 19:12:46 GMT

_Version update only_

## 2.1.119
Thu, 11 Jul 2019 19:13:08 GMT

_Version update only_

## 2.1.118
Tue, 09 Jul 2019 19:13:24 GMT

_Version update only_

## 2.1.117
Mon, 08 Jul 2019 19:12:19 GMT

_Version update only_

## 2.1.116
Sat, 29 Jun 2019 02:30:10 GMT

_Version update only_

## 2.1.115
Wed, 12 Jun 2019 19:12:33 GMT

_Version update only_

## 2.1.114
Tue, 11 Jun 2019 00:48:06 GMT

_Version update only_

## 2.1.113
Thu, 06 Jun 2019 22:33:36 GMT

_Version update only_

## 2.1.112
Wed, 05 Jun 2019 19:12:34 GMT

_Version update only_

## 2.1.111
Tue, 04 Jun 2019 05:51:54 GMT

_Version update only_

## 2.1.110
Mon, 27 May 2019 04:13:44 GMT

_Version update only_

## 2.1.109
Mon, 13 May 2019 02:08:35 GMT

_Version update only_

## 2.1.108
Mon, 06 May 2019 20:46:22 GMT

_Version update only_

## 2.1.107
Mon, 06 May 2019 19:34:54 GMT

_Version update only_

## 2.1.106
Mon, 06 May 2019 19:11:16 GMT

_Version update only_

## 2.1.105
Tue, 30 Apr 2019 23:08:02 GMT

_Version update only_

## 2.1.104
Tue, 16 Apr 2019 11:01:37 GMT

_Version update only_

## 2.1.103
Fri, 12 Apr 2019 06:13:17 GMT

_Version update only_

## 2.1.102
Thu, 11 Apr 2019 07:14:01 GMT

_Version update only_

## 2.1.101
Tue, 09 Apr 2019 05:31:01 GMT

_Version update only_

## 2.1.100
Mon, 08 Apr 2019 19:12:53 GMT

_Version update only_

## 2.1.99
Sat, 06 Apr 2019 02:05:51 GMT

_Version update only_

## 2.1.98
Fri, 05 Apr 2019 04:16:17 GMT

_Version update only_

## 2.1.97
Wed, 03 Apr 2019 02:58:33 GMT

_Version update only_

## 2.1.96
Tue, 02 Apr 2019 01:12:02 GMT

_Version update only_

## 2.1.95
Sat, 30 Mar 2019 22:27:16 GMT

_Version update only_

## 2.1.94
Thu, 28 Mar 2019 19:14:27 GMT

_Version update only_

## 2.1.93
Tue, 26 Mar 2019 20:54:19 GMT

_Version update only_

## 2.1.92
Sat, 23 Mar 2019 03:48:31 GMT

_Version update only_

## 2.1.91
Thu, 21 Mar 2019 04:59:11 GMT

_Version update only_

## 2.1.90
Thu, 21 Mar 2019 01:15:33 GMT

_Version update only_

## 2.1.89
Wed, 20 Mar 2019 19:14:49 GMT

_Version update only_

## 2.1.88
Mon, 18 Mar 2019 04:28:43 GMT

_Version update only_

## 2.1.87
Fri, 15 Mar 2019 19:13:25 GMT

_Version update only_

## 2.1.86
Wed, 13 Mar 2019 19:13:14 GMT

_Version update only_

## 2.1.85
Wed, 13 Mar 2019 01:14:05 GMT

_Version update only_

## 2.1.84
Mon, 11 Mar 2019 16:13:36 GMT

_Version update only_

## 2.1.83
Tue, 05 Mar 2019 17:13:11 GMT

_Version update only_

## 2.1.82
Mon, 04 Mar 2019 17:13:20 GMT

_Version update only_

## 2.1.81
Wed, 27 Feb 2019 22:13:58 GMT

_Version update only_

## 2.1.80
Wed, 27 Feb 2019 17:13:17 GMT

_Version update only_

## 2.1.79
Mon, 18 Feb 2019 17:13:23 GMT

_Version update only_

## 2.1.78
Tue, 12 Feb 2019 17:13:12 GMT

_Version update only_

## 2.1.77
Mon, 11 Feb 2019 10:32:37 GMT

_Version update only_

## 2.1.76
Mon, 11 Feb 2019 03:31:55 GMT

_Version update only_

## 2.1.75
Wed, 30 Jan 2019 20:49:12 GMT

_Version update only_

## 2.1.74
Sat, 19 Jan 2019 03:47:47 GMT

_Version update only_

## 2.1.73
Tue, 15 Jan 2019 17:04:09 GMT

_Version update only_

## 2.1.72
Thu, 10 Jan 2019 01:57:53 GMT

_Version update only_

## 2.1.71
Mon, 07 Jan 2019 17:04:07 GMT

_Version update only_

## 2.1.70
Wed, 19 Dec 2018 05:57:33 GMT

_Version update only_

## 2.1.69
Thu, 13 Dec 2018 02:58:11 GMT

_Version update only_

## 2.1.68
Wed, 12 Dec 2018 17:04:19 GMT

_Version update only_

## 2.1.67
Sat, 08 Dec 2018 06:35:36 GMT

_Version update only_

## 2.1.66
Fri, 07 Dec 2018 17:04:56 GMT

_Version update only_

## 2.1.65
Fri, 30 Nov 2018 23:34:58 GMT

_Version update only_

## 2.1.64
Thu, 29 Nov 2018 07:02:09 GMT

_Version update only_

## 2.1.63
Thu, 29 Nov 2018 00:35:39 GMT

_Version update only_

## 2.1.62
Wed, 28 Nov 2018 19:29:54 GMT

_Version update only_

## 2.1.61
Wed, 28 Nov 2018 02:17:11 GMT

_Version update only_

## 2.1.60
Fri, 16 Nov 2018 21:37:10 GMT

_Version update only_

## 2.1.59
Fri, 16 Nov 2018 00:59:00 GMT

_Version update only_

## 2.1.58
Fri, 09 Nov 2018 23:07:39 GMT

_Version update only_

## 2.1.57
Wed, 07 Nov 2018 21:04:35 GMT

_Version update only_

## 2.1.56
Wed, 07 Nov 2018 17:03:03 GMT

_Version update only_

## 2.1.55
Mon, 05 Nov 2018 17:04:24 GMT

_Version update only_

## 2.1.54
Thu, 01 Nov 2018 21:33:52 GMT

_Version update only_

## 2.1.53
Thu, 01 Nov 2018 19:32:52 GMT

_Version update only_

## 2.1.52
Wed, 31 Oct 2018 21:17:50 GMT

_Version update only_

## 2.1.51
Wed, 31 Oct 2018 17:00:55 GMT

_Version update only_

## 2.1.50
Sat, 27 Oct 2018 03:45:51 GMT

_Version update only_

## 2.1.49
Sat, 27 Oct 2018 02:17:18 GMT

_Version update only_

## 2.1.48
Sat, 27 Oct 2018 00:26:56 GMT

_Version update only_

## 2.1.47
Thu, 25 Oct 2018 23:20:40 GMT

_Version update only_

## 2.1.46
Thu, 25 Oct 2018 08:56:02 GMT

_Version update only_

## 2.1.45
Wed, 24 Oct 2018 16:03:10 GMT

_Version update only_

## 2.1.44
Thu, 18 Oct 2018 05:30:14 GMT

_Version update only_

## 2.1.43
Thu, 18 Oct 2018 01:32:21 GMT

_Version update only_

## 2.1.42
Wed, 17 Oct 2018 21:04:49 GMT

_Version update only_

## 2.1.41
Wed, 17 Oct 2018 14:43:24 GMT

_Version update only_

## 2.1.40
Thu, 11 Oct 2018 23:26:07 GMT

_Version update only_

## 2.1.39
Tue, 09 Oct 2018 06:58:02 GMT

_Version update only_

## 2.1.38
Mon, 08 Oct 2018 16:04:27 GMT

_Version update only_

## 2.1.37
Sun, 07 Oct 2018 06:15:56 GMT

_Version update only_

## 2.1.36
Fri, 28 Sep 2018 16:05:35 GMT

_Version update only_

## 2.1.35
Wed, 26 Sep 2018 21:39:40 GMT

_Version update only_

## 2.1.34
Mon, 24 Sep 2018 23:06:40 GMT

_Version update only_

## 2.1.33
Mon, 24 Sep 2018 16:04:28 GMT

_Version update only_

## 2.1.32
Fri, 21 Sep 2018 16:04:42 GMT

_Version update only_

## 2.1.31
Thu, 20 Sep 2018 23:57:22 GMT

_Version update only_

## 2.1.30
Tue, 18 Sep 2018 21:04:56 GMT

_Version update only_

## 2.1.29
Mon, 10 Sep 2018 23:23:01 GMT

_Version update only_

## 2.1.28
Thu, 06 Sep 2018 01:25:26 GMT

### Patches

- Update "repository" field in package.json

## 2.1.27
Tue, 04 Sep 2018 21:34:10 GMT

_Version update only_

## 2.1.26
Mon, 03 Sep 2018 16:04:46 GMT

_Version update only_

## 2.1.25
Thu, 30 Aug 2018 22:47:34 GMT

_Version update only_

## 2.1.24
Thu, 30 Aug 2018 19:23:16 GMT

_Version update only_

## 2.1.23
Thu, 30 Aug 2018 18:45:12 GMT

_Version update only_

## 2.1.22
Wed, 29 Aug 2018 21:43:23 GMT

_Version update only_

## 2.1.21
Wed, 29 Aug 2018 06:36:50 GMT

_Version update only_

## 2.1.20
Thu, 23 Aug 2018 18:18:53 GMT

### Patches

- Republish all packages in web-build-tools to resolve GitHub issue #782

## 2.1.19
Wed, 22 Aug 2018 20:58:58 GMT

_Version update only_

## 2.1.18
Wed, 22 Aug 2018 16:03:25 GMT

_Version update only_

## 2.1.17
Tue, 21 Aug 2018 16:04:38 GMT

_Version update only_

## 2.1.16
Thu, 09 Aug 2018 21:58:02 GMT

_Version update only_

## 2.1.15
Thu, 09 Aug 2018 21:03:22 GMT

_Version update only_

## 2.1.14
Thu, 09 Aug 2018 16:04:24 GMT

### Patches

- Update lodash.

## 2.1.13
Tue, 07 Aug 2018 22:27:31 GMT

_Version update only_

## 2.1.12
Thu, 26 Jul 2018 23:53:43 GMT

_Version update only_

## 2.1.11
Thu, 26 Jul 2018 16:04:17 GMT

_Version update only_

## 2.1.10
Wed, 25 Jul 2018 21:02:57 GMT

_Version update only_

## 2.1.9
Fri, 20 Jul 2018 16:04:52 GMT

_Version update only_

## 2.1.8
Tue, 17 Jul 2018 16:02:52 GMT

_Version update only_

## 2.1.7
Fri, 13 Jul 2018 19:04:50 GMT

_Version update only_

## 2.1.6
Tue, 03 Jul 2018 21:03:31 GMT

_Version update only_

## 2.1.5
Fri, 29 Jun 2018 02:56:51 GMT

_Version update only_

## 2.1.4
Sat, 23 Jun 2018 02:21:20 GMT

_Version update only_

## 2.1.3
Fri, 22 Jun 2018 16:05:15 GMT

_Version update only_

## 2.1.2
Thu, 21 Jun 2018 08:27:29 GMT

_Version update only_

## 2.1.1
Tue, 19 Jun 2018 19:35:11 GMT

_Version update only_

## 2.1.0
Wed, 13 Jun 2018 16:05:21 GMT

### Minor changes

- Include an option to skip chunk and asset detection.

## 2.0.0
Fri, 08 Jun 2018 08:43:52 GMT

### Breaking changes

- Update the plugin to support Webpack 4.

## 1.5.12
Thu, 31 May 2018 01:39:33 GMT

_Version update only_

## 1.5.11
Tue, 15 May 2018 02:26:45 GMT

_Version update only_

## 1.5.10
Tue, 15 May 2018 00:18:10 GMT

_Version update only_

## 1.5.9
Fri, 11 May 2018 22:43:14 GMT

_Version update only_

## 1.5.8
Fri, 04 May 2018 00:42:38 GMT

_Version update only_

## 1.5.7
Tue, 01 May 2018 22:03:20 GMT

_Version update only_

## 1.5.6
Fri, 27 Apr 2018 03:04:32 GMT

_Version update only_

## 1.5.5
Fri, 20 Apr 2018 16:06:11 GMT

_Version update only_

## 1.5.4
Thu, 19 Apr 2018 21:25:56 GMT

_Version update only_

## 1.5.3
Thu, 19 Apr 2018 17:02:06 GMT

_Version update only_

## 1.5.2
Fri, 06 Apr 2018 16:03:14 GMT

### Patches

- Upgrade types for webpack@~3.11.0 compatibility

## 1.5.1
Tue, 03 Apr 2018 16:05:29 GMT

_Version update only_

## 1.5.0
Mon, 02 Apr 2018 16:05:24 GMT

### Minor changes

- Adding new option to ISetWebpackPublicPathOptions, called findLast

## 1.4.29
Tue, 27 Mar 2018 01:34:25 GMT

_Version update only_

## 1.4.28
Mon, 26 Mar 2018 19:12:42 GMT

_Version update only_

## 1.4.27
Sun, 25 Mar 2018 01:26:19 GMT

_Version update only_

## 1.4.26
Fri, 23 Mar 2018 00:34:53 GMT

_Version update only_

## 1.4.25
Thu, 22 Mar 2018 18:34:13 GMT

_Version update only_

## 1.4.24
Tue, 20 Mar 2018 02:44:45 GMT

_Version update only_

## 1.4.23
Sat, 17 Mar 2018 02:54:22 GMT

_Version update only_

## 1.4.22
Thu, 15 Mar 2018 20:00:50 GMT

_Version update only_

## 1.4.21
Thu, 15 Mar 2018 16:05:43 GMT

_Version update only_

## 1.4.20
Tue, 13 Mar 2018 23:11:32 GMT

_Version update only_

## 1.4.19
Mon, 12 Mar 2018 20:36:19 GMT

### Patches

- Locked down some "@types/" dependency versions to avoid upgrade conflicts

## 1.4.18
Tue, 06 Mar 2018 17:04:51 GMT

_Version update only_

## 1.4.17
Fri, 02 Mar 2018 01:13:59 GMT

_Version update only_

## 1.4.16
Tue, 27 Feb 2018 22:05:57 GMT

_Version update only_

## 1.4.15
Wed, 21 Feb 2018 22:04:19 GMT

_Version update only_

## 1.4.14
Wed, 21 Feb 2018 03:13:29 GMT

_Version update only_

## 1.4.13
Sat, 17 Feb 2018 02:53:49 GMT

_Version update only_

## 1.4.12
Fri, 16 Feb 2018 22:05:23 GMT

_Version update only_

## 1.4.11
Fri, 16 Feb 2018 17:05:11 GMT

_Version update only_

## 1.4.10
Wed, 07 Feb 2018 17:05:11 GMT

_Version update only_

## 1.4.9
Fri, 26 Jan 2018 22:05:30 GMT

_Version update only_

## 1.4.8
Fri, 26 Jan 2018 17:53:38 GMT

### Patches

- Force a patch bump in case the previous version was an empty package

## 1.4.7
Fri, 26 Jan 2018 00:36:51 GMT

_Version update only_

## 1.4.6
Tue, 23 Jan 2018 17:05:28 GMT

_Version update only_

## 1.4.5
Thu, 18 Jan 2018 03:23:46 GMT

_Version update only_

## 1.4.4
Thu, 18 Jan 2018 00:48:06 GMT

_Version update only_

## 1.4.3
Wed, 17 Jan 2018 10:49:31 GMT

_Version update only_

## 1.4.2
Fri, 12 Jan 2018 03:35:22 GMT

_Version update only_

## 1.4.1
Thu, 11 Jan 2018 22:31:51 GMT

_Version update only_

## 1.4.0
Wed, 10 Jan 2018 20:40:01 GMT

### Minor changes

- Upgrade to Node 8

## 1.3.14
Tue, 09 Jan 2018 17:05:51 GMT

### Patches

- Get web-build-tools building with pnpm

## 1.3.13
Sun, 07 Jan 2018 05:12:08 GMT

_Version update only_

## 1.3.12
Fri, 05 Jan 2018 20:26:45 GMT

_Version update only_

## 1.3.11
Fri, 05 Jan 2018 00:48:41 GMT

_Version update only_

## 1.3.10
Fri, 22 Dec 2017 17:04:46 GMT

_Version update only_

## 1.3.9
Tue, 12 Dec 2017 03:33:27 GMT

_Version update only_

## 1.3.8
Thu, 30 Nov 2017 23:59:09 GMT

_Version update only_

## 1.3.7
Thu, 30 Nov 2017 23:12:21 GMT

_Version update only_

## 1.3.6
Wed, 29 Nov 2017 17:05:37 GMT

_Version update only_

## 1.3.5
Tue, 28 Nov 2017 23:43:55 GMT

_Version update only_

## 1.3.4
Mon, 13 Nov 2017 17:04:50 GMT

_Version update only_

## 1.3.3
Mon, 06 Nov 2017 17:04:18 GMT

_Version update only_

## 1.3.2
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 1.3.1
Tue, 24 Oct 2017 18:17:12 GMT

_Version update only_

## 1.3.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 1.2.5
Thu, 21 Sep 2017 20:34:26 GMT

### Patches

- Upgrade webpack to 3.6.0.

## 1.2.4
Tue, 19 Sep 2017 19:04:50 GMT

### Patches

- Minor README correction.

## 1.2.3
Fri, 08 Sep 2017 01:28:04 GMT

### Patches

- Deprecate @types/es6-coll ections in favor of built-in typescript typings 'es2015.collection' a nd 'es2015.iterable'

## 1.2.2
Fri, 01 Sep 2017 01:05:54 GMT

### Patches

- Updating uglifyjs.

## 1.2.1
Thu, 31 Aug 2017 18:41:18 GMT

_Version update only_

## 1.2.0
Wed, 30 Aug 2017 22:08:21 GMT

### Minor changes

- Upgrade to webpack 3.X.

## 1.1.2
Wed, 30 Aug 2017 01:04:34 GMT

_Version update only_

## 1.1.1
Tue, 22 Aug 2017 13:04:22 GMT

_Version update only_

## 1.1.0
Thu, 03 Aug 2017 19:16:55 GMT

### Minor changes

- Add a new getPostProcessScript configuration option to allow consumers to do arbitrary post-processing on the webpack public path variable.

## 1.0.1
Tue, 01 Aug 2017 17:42:31 GMT

### Patches

- Expose registryVariableName field

## 1.0.0
Mon, 31 Jul 2017 21:18:26 GMT

### Breaking changes

- Initial commit

