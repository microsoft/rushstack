# Change Log - @rushstack/heft-dev-cert-plugin

This log was last generated on Fri, 20 Feb 2026 16:14:49 GMT and should not be manually modified.

## 1.1.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 1.1.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.1.0
Thu, 19 Feb 2026 00:04:52 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 1.0.15
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.0.14
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.0.13
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.0.12
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.0.11
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.0.10
Wed, 07 Jan 2026 01:12:24 GMT

_Version update only_

## 1.0.9
Mon, 05 Jan 2026 16:12:49 GMT

_Version update only_

## 1.0.8
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.0.7
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.0.6
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.0.5
Tue, 04 Nov 2025 08:15:14 GMT

_Version update only_

## 1.0.4
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 1.0.3
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 1.0.2
Wed, 08 Oct 2025 00:13:28 GMT

_Version update only_

## 1.0.1
Fri, 03 Oct 2025 20:10:00 GMT

_Version update only_

## 1.0.0
Tue, 30 Sep 2025 23:57:45 GMT

### Breaking changes

- Release Heft version 1.0.0

## 0.4.113
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.4.112
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.4.111
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.4.110
Fri, 29 Aug 2025 00:08:01 GMT

_Version update only_

## 0.4.109
Tue, 26 Aug 2025 00:12:57 GMT

_Version update only_

## 0.4.108
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.4.107
Fri, 01 Aug 2025 00:12:48 GMT

_Version update only_

## 0.4.106
Sat, 26 Jul 2025 00:12:22 GMT

_Version update only_

## 0.4.105
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.4.104
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.4.103
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.4.102
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.4.101
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.4.100
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.4.99
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.4.98
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 0.4.97
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 0.4.96
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 0.4.95
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 0.4.94
Tue, 25 Mar 2025 15:11:15 GMT

_Version update only_

## 0.4.93
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 0.4.92
Wed, 12 Mar 2025 00:11:31 GMT

_Version update only_

## 0.4.91
Tue, 11 Mar 2025 02:12:33 GMT

_Version update only_

## 0.4.90
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.4.89
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.4.88
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.4.87
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 0.4.86
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.4.85
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.4.84
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.4.83
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.4.82
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.4.81
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.4.80
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.4.79
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.4.78
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.4.77
Tue, 03 Dec 2024 16:11:07 GMT

_Version update only_

## 0.4.76
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.4.75
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.4.74
Thu, 24 Oct 2024 00:15:47 GMT

_Version update only_

## 0.4.73
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.4.72
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.4.71
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.4.70
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 0.4.69
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.4.68
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.4.67
Sat, 21 Sep 2024 00:10:27 GMT

_Version update only_

## 0.4.66
Fri, 13 Sep 2024 00:11:42 GMT

_Version update only_

## 0.4.65
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.4.64
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.4.63
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.4.62
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.4.61
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.4.60
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 0.4.59
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 0.4.58
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.4.57
Tue, 16 Jul 2024 00:36:21 GMT

_Version update only_

## 0.4.56
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.4.55
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.4.54
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.4.53
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 0.4.52
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.4.51
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.4.50
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.4.49
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.4.48
Fri, 24 May 2024 00:15:08 GMT

_Version update only_

## 0.4.47
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.4.46
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.4.45
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.4.44
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.4.43
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.4.42
Wed, 08 May 2024 22:23:50 GMT

_Version update only_

## 0.4.41
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 0.4.40
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.4.39
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 0.4.38
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 0.4.37
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 0.4.36
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 0.4.35
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 0.4.34
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 0.4.33
Thu, 29 Feb 2024 07:11:45 GMT

_Version update only_

## 0.4.32
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 0.4.31
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.4.30
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 0.4.29
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.4.28
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 0.4.27
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.4.26
Tue, 20 Feb 2024 16:10:52 GMT

_Version update only_

## 0.4.25
Mon, 19 Feb 2024 21:54:27 GMT

_Version update only_

## 0.4.24
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 0.4.23
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 0.4.22
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 0.4.21
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.4.20
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.4.19
Tue, 23 Jan 2024 20:12:57 GMT

_Version update only_

## 0.4.18
Tue, 23 Jan 2024 16:15:05 GMT

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

## 0.3.26
Wed, 13 Sep 2023 00:32:29 GMT

_Version update only_

## 0.3.25
Tue, 08 Aug 2023 07:10:39 GMT

_Version update only_

## 0.3.24
Mon, 31 Jul 2023 15:19:05 GMT

_Version update only_

## 0.3.23
Sat, 29 Jul 2023 00:22:50 GMT

_Version update only_

## 0.3.22
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

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
Thu, 15 Jun 2023 00:21:01 GMT

_Version update only_

## 0.3.11
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.3.10
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.3.9
Tue, 13 Jun 2023 01:49:01 GMT

### Patches

- Bump webpack to v5.82.1

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

## 0.2.32
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.2.31
Wed, 24 May 2023 00:19:12 GMT

_Version update only_

## 0.2.30
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 0.2.29
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 0.2.28
Thu, 04 May 2023 00:20:28 GMT

_Version update only_

## 0.2.27
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 0.2.26
Sat, 29 Apr 2023 00:23:02 GMT

_Version update only_

## 0.2.25
Thu, 27 Apr 2023 17:18:42 GMT

_Version update only_

## 0.2.24
Thu, 20 Apr 2023 15:16:55 GMT

### Patches

- Update webpack to v5.80.0

## 0.2.23
Mon, 17 Apr 2023 15:21:31 GMT

_Version update only_

## 0.2.22
Fri, 07 Apr 2023 22:19:21 GMT

### Patches

- Bump webpack to 5.78.0

## 0.2.21
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 0.2.20
Mon, 20 Mar 2023 20:14:20 GMT

_Version update only_

## 0.2.19
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 0.2.18
Fri, 03 Mar 2023 04:11:20 GMT

_Version update only_

## 0.2.17
Fri, 10 Feb 2023 01:18:50 GMT

_Version update only_

## 0.2.16
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 0.2.15
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 0.2.14
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 0.2.13
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 0.2.12
Thu, 26 Jan 2023 02:55:09 GMT

### Patches

- Upgrade to webpack 5.75.0

## 0.2.11
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 0.2.10
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 0.2.9
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 0.2.8
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 0.2.7
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 0.2.6
Fri, 18 Nov 2022 00:55:17 GMT

_Version update only_

## 0.2.5
Tue, 15 Nov 2022 23:31:49 GMT

### Patches

- Fix Webpack auto-refresh issues caused by mismatched hostname

## 0.2.4
Sat, 12 Nov 2022 00:16:31 GMT

### Patches

- Serve the CA certificate alongside the TLS certificate.

## 0.2.3
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 0.2.2
Fri, 04 Nov 2022 00:15:59 GMT

_Version update only_

## 0.2.1
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 0.2.0
Tue, 25 Oct 2022 00:20:44 GMT

### Minor changes

- Set allowedHosts from the subjectAltNames of the TLS certificate.

## 0.1.73
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 0.1.72
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 0.1.71
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 0.1.70
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 0.1.69
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 0.1.68
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 0.1.67
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 0.1.66
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 0.1.65
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 0.1.64
Thu, 15 Sep 2022 00:18:51 GMT

_Version update only_

## 0.1.63
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 0.1.62
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 0.1.61
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 0.1.60
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 0.1.59
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 0.1.58
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 0.1.57
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 0.1.56
Fri, 19 Aug 2022 00:17:19 GMT

_Version update only_

## 0.1.55
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 0.1.54
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 0.1.53
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 0.1.52
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 0.1.51
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 0.1.50
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 0.1.49
Wed, 13 Jul 2022 21:31:13 GMT

### Patches

- Upgrade webpack-dev-server

## 0.1.48
Fri, 08 Jul 2022 15:17:46 GMT

_Version update only_

## 0.1.47
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 0.1.46
Thu, 30 Jun 2022 04:48:53 GMT

_Version update only_

## 0.1.45
Tue, 28 Jun 2022 22:47:13 GMT

_Version update only_

## 0.1.44
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 0.1.43
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 0.1.42
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 0.1.41
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 0.1.40
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 0.1.39
Thu, 23 Jun 2022 22:14:24 GMT

_Version update only_

## 0.1.38
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 0.1.37
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 0.1.36
Tue, 07 Jun 2022 09:37:04 GMT

_Version update only_

## 0.1.35
Wed, 25 May 2022 22:25:07 GMT

_Version update only_

## 0.1.34
Thu, 19 May 2022 15:13:20 GMT

_Version update only_

## 0.1.33
Wed, 18 May 2022 15:10:55 GMT

### Patches

- fix issue where webpack-dev-server v4 users recieved deprecation warnings

## 0.1.32
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 0.1.31
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 0.1.30
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 0.1.29
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 0.1.28
Sat, 23 Apr 2022 02:13:06 GMT

_Version update only_

## 0.1.27
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 0.1.26
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 0.1.25
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 0.1.24
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 0.1.23
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 0.1.22
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 0.1.21
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 0.1.20
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 0.1.19
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 0.1.18
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 0.1.17
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 0.1.16
Fri, 11 Feb 2022 10:30:25 GMT

_Version update only_

## 0.1.15
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 0.1.14
Fri, 21 Jan 2022 01:10:41 GMT

_Version update only_

## 0.1.13
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 0.1.12
Thu, 06 Jan 2022 08:49:34 GMT

_Version update only_

## 0.1.11
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 0.1.10
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 0.1.9
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 0.1.8
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 0.1.7
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 0.1.6
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 0.1.5
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 0.1.4
Mon, 06 Dec 2021 16:08:32 GMT

_Version update only_

## 0.1.3
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 0.1.2
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 0.1.1
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 0.1.0
Tue, 09 Nov 2021 16:08:07 GMT

### Minor changes

- Introduce the heft-dev-cert-plugin for https with webpack-dev-server.

