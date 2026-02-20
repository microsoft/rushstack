# Change Log - @rushstack/webpack-embedded-dependencies-plugin

This log was last generated on Fri, 20 Feb 2026 00:15:04 GMT and should not be manually modified.

## 0.4.2
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 0.4.1
Thu, 19 Feb 2026 01:30:06 GMT

### Patches

- Add missing LICENSE file to package.

## 0.4.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 0.3.15
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 0.3.14
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 0.3.13
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 0.3.12
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 0.3.11
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 0.3.10
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 0.3.9
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 0.3.8
Thu, 18 Dec 2025 01:13:04 GMT

### Patches

- Fix support for newer webpack typings.

## 0.3.7
Sat, 06 Dec 2025 01:12:29 GMT

_Version update only_

## 0.3.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 0.3.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 0.3.4
Tue, 04 Nov 2025 08:15:15 GMT

_Version update only_

## 0.3.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 0.3.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 0.3.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 0.3.0
Fri, 03 Oct 2025 20:10:00 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 0.2.111
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 0.2.110
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.2.109
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.2.108
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.2.107
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.2.106
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 0.2.105
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.2.104
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.2.103
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.2.102
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.2.101
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.2.100
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.2.99
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.2.98
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 0.2.97
Tue, 15 Apr 2025 15:11:58 GMT

_Version update only_

## 0.2.96
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 0.2.95
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 0.2.94
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 0.2.93
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 0.2.92
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 0.2.91
Tue, 11 Mar 2025 02:12:34 GMT

_Version update only_

## 0.2.90
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.2.89
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.2.88
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.2.87
Wed, 26 Feb 2025 16:11:12 GMT

_Version update only_

## 0.2.86
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.2.85
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.2.84
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.2.83
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.2.82
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.2.81
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.2.80
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.2.79
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.2.78
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.2.77
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 0.2.76
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.2.75
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.2.74
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.2.73
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.2.72
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.2.71
Tue, 15 Oct 2024 00:12:32 GMT

_Version update only_

## 0.2.70
Wed, 02 Oct 2024 00:11:19 GMT

### Patches

- Ensure compatibility with webpack 5.95.0

## 0.2.69
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.2.68
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.2.67
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.2.66
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.2.65
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.2.64
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.2.63
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.2.62
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.2.61
Wed, 24 Jul 2024 00:12:15 GMT

_Version update only_

## 0.2.60
Wed, 17 Jul 2024 06:55:10 GMT

_Version update only_

## 0.2.59
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.2.58
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 0.2.57
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.2.56
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.2.55
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.2.54
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 0.2.53
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.2.52
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.2.51
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.2.50
Sat, 25 May 2024 04:54:08 GMT

_Version update only_

## 0.2.49
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 0.2.48
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.2.47
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.2.46
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.2.45
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.2.44
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.2.43
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 0.2.42
Mon, 06 May 2024 15:11:05 GMT

_Version update only_

## 0.2.41
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.2.40
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 0.2.39
Fri, 15 Mar 2024 00:12:41 GMT

_Version update only_

## 0.2.38
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 0.2.37
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 0.2.36
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 0.2.35
Fri, 01 Mar 2024 01:10:09 GMT

_Version update only_

## 0.2.34
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 0.2.33
Wed, 28 Feb 2024 16:09:28 GMT

_Version update only_

## 0.2.32
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.2.31
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 0.2.30
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.2.29
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 0.2.28
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.2.27
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 0.2.26
Mon, 19 Feb 2024 21:54:27 GMT

_Version update only_

## 0.2.25
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 0.2.24
Thu, 08 Feb 2024 01:09:22 GMT

_Version update only_

## 0.2.23
Wed, 07 Feb 2024 01:11:19 GMT

_Version update only_

## 0.2.22
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.2.21
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.2.20
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 0.2.19
Tue, 23 Jan 2024 16:15:05 GMT

_Version update only_

## 0.2.18
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 0.2.17
Fri, 12 Jan 2024 01:23:10 GMT

_Version update only_

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
Wed, 01 Nov 2023 23:11:36 GMT

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
Wed, 27 Sep 2023 00:21:39 GMT

_Version update only_

## 0.2.5
Tue, 26 Sep 2023 21:02:31 GMT

_Version update only_

## 0.2.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.2.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 0.2.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 0.2.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 0.2.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 0.1.37
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.1.36
Mon, 31 Jul 2023 15:19:06 GMT

_Version update only_

## 0.1.35
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.1.34
Thu, 20 Jul 2023 20:47:29 GMT

_Version update only_

## 0.1.33
Wed, 19 Jul 2023 00:20:32 GMT

_Version update only_

## 0.1.32
Fri, 14 Jul 2023 15:20:46 GMT

_Version update only_

## 0.1.31
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.1.30
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 0.1.29
Wed, 12 Jul 2023 00:23:30 GMT

_Version update only_

## 0.1.28
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 0.1.27
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.1.26
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 0.1.25
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.1.24
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.1.23
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.1.22
Tue, 13 Jun 2023 15:17:21 GMT

_Version update only_

## 0.1.21
Tue, 13 Jun 2023 01:49:01 GMT

### Patches

- Bump webpack to v5.82.1

## 0.1.20
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.1.19
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 0.1.18
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 0.1.17
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.1.16
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 0.1.15
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 0.1.14
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 0.1.13
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 0.1.12
Fri, 02 Jun 2023 02:01:13 GMT

_Version update only_

## 0.1.11
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.1.10
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 0.1.9
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 0.1.8
Thu, 04 May 2023 00:20:29 GMT

_Version update only_

## 0.1.7
Mon, 01 May 2023 15:23:20 GMT

_Version update only_

## 0.1.6
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 0.1.5
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 0.1.4
Thu, 20 Apr 2023 15:16:55 GMT

### Patches

- Update webpack to v5.80.0

## 0.1.3
Fri, 07 Apr 2023 22:19:21 GMT

### Patches

- Bump webpack to 5.78.0

## 0.1.2
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 0.1.1
Thu, 23 Mar 2023 15:24:08 GMT

_Version update only_

## 0.1.0
Wed, 22 Mar 2023 20:48:30 GMT

### Minor changes

- Introduce webpack-embedded-dependencies-plugin

