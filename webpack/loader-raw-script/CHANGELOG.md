# Change Log - @rushstack/loader-raw-script

This log was last generated on Wed, 25 Feb 2026 00:34:30 GMT and should not be manually modified.

## 1.6.5
Wed, 25 Feb 2026 00:34:30 GMT

_Version update only_

## 1.6.4
Tue, 24 Feb 2026 01:13:27 GMT

_Version update only_

## 1.6.3
Mon, 23 Feb 2026 00:42:21 GMT

_Version update only_

## 1.6.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 1.6.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.6.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 1.5.14
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.5.13
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.5.12
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.5.11
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.5.10
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.5.9
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 1.5.8
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 1.5.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.5.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.5.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.5.4
Tue, 04 Nov 2025 08:15:15 GMT

_Version update only_

## 1.5.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 1.5.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 1.5.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 1.5.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 1.4.110
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 1.4.109
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 1.4.108
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 1.4.107
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 1.4.106
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 1.4.105
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 1.4.104
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 1.4.103
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 1.4.102
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 1.4.101
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 1.4.100
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 1.4.99
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 1.4.98
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 1.4.97
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 1.4.96
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 1.4.95
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 1.4.94
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 1.4.93
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 1.4.92
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 1.4.91
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 1.4.90
Tue, 11 Mar 2025 02:12:34 GMT

_Version update only_

## 1.4.89
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 1.4.88
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 1.4.87
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 1.4.86
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 1.4.85
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 1.4.84
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 1.4.83
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 1.4.82
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 1.4.81
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 1.4.80
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 1.4.79
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 1.4.78
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 1.4.77
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 1.4.76
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 1.4.75
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 1.4.74
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 1.4.73
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 1.4.72
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 1.4.71
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 1.4.70
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 1.4.69
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 1.4.68
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 1.4.67
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 1.4.66
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 1.4.65
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 1.4.64
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 1.4.63
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 1.4.62
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 1.4.61
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 1.4.60
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 1.4.59
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 1.4.58
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 1.4.57
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 1.4.56
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 1.4.55
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 1.4.54
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 1.4.53
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 1.4.52
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 1.4.51
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 1.4.50
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 1.4.49
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 1.4.48
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 1.4.47
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 1.4.46
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 1.4.45
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 1.4.44
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 1.4.43
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 1.4.42
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 1.4.41
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 1.4.40
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 1.4.39
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 1.4.38
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 1.4.37
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 1.4.36
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 1.4.35
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 1.4.34
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 1.4.33
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 1.4.32
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 1.4.31
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 1.4.30
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 1.4.29
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 1.4.28
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 1.4.27
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 1.4.26
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 1.4.25
Mon, 19 Feb 2024 21:54:26 GMT

### Patches

- Fix a formatting issue with the LICENSE.

## 1.4.24
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 1.4.23
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 1.4.22
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 1.4.21
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 1.4.20
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 1.4.19
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 1.4.18
Tue, 23 Jan 2024 16:15:06 GMT

_Version update only_

## 1.4.17
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 1.4.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 1.4.15
Wed, 20 Dec 2023 01:09:46 GMT

_Version update only_

## 1.4.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 1.4.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 1.4.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 1.4.11
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 1.4.10
Mon, 30 Oct 2023 23:36:38 GMT

_Version update only_

## 1.4.9
Sun, 01 Oct 2023 02:56:30 GMT

_Version update only_

## 1.4.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 1.4.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 1.4.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 1.4.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 1.4.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 1.4.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 1.4.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 1.4.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 1.4.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 1.3.316
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 1.3.315
Mon, 31 Jul 2023 15:19:06 GMT

_Version update only_

## 1.3.314
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 1.3.313
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 1.3.312
Wed, 19 Jul 2023 00:20:32 GMT

_Version update only_

## 1.3.311
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 1.3.310
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 1.3.309
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 1.3.308
Wed, 12 Jul 2023 00:23:30 GMT

_Version update only_

## 1.3.307
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 1.3.306
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 1.3.305
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 1.3.304
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 1.3.303
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 1.3.302
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 1.3.301
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 1.3.300
Tue, 13 Jun 2023 01:49:02 GMT

_Version update only_

## 1.3.299
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 1.3.298
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 1.3.297
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 1.3.296
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 1.3.295
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 1.3.294
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 1.3.293
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 1.3.292
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 1.3.291
Fri, 02 Jun 2023 02:01:12 GMT

_Version update only_

## 1.3.290
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 1.3.289
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 1.3.288
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 1.3.287
Thu, 04 May 2023 00:20:29 GMT

_Version update only_

## 1.3.286
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 1.3.285
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 1.3.284
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 1.3.283
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 1.3.282
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 1.3.281
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 1.3.280
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 1.3.279
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 1.3.278
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 1.3.277
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 1.3.276
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 1.3.275
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 1.3.274
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 1.3.273
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 1.3.272
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 1.3.271
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 1.3.270
Mon, 14 Nov 2022 05:15:02 GMT

### Patches

- Updating webpack/loader-utils to resolve github advisory CVE-2022-37601. https://github.com/advisories/GHSA-76p3-8jx3-jpfq

## 1.3.269
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 1.3.268
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 1.3.267
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 1.3.266
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 1.3.265
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 1.3.264
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 1.3.263
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 1.3.262
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 1.3.261
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 1.3.260
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 1.3.259
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 1.3.258
Thu, 15 Sep 2022 00:18:52 GMT

_Version update only_

## 1.3.257
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 1.3.256
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 1.3.255
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 1.3.254
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 1.3.253
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 1.3.252
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 1.3.251
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 1.3.250
Fri, 19 Aug 2022 00:17:20 GMT

_Version update only_

## 1.3.249
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 1.3.248
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 1.3.247
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 1.3.246
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 1.3.245
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 1.3.244
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 1.3.243
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 1.3.242
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 1.3.241
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 1.3.240
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 1.3.239
Tue, 28 Jun 2022 22:47:14 GMT

_Version update only_

## 1.3.238
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 1.3.237
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 1.3.236
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 1.3.235
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 1.3.234
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 1.3.233
Thu, 23 Jun 2022 22:14:25 GMT

_Version update only_

## 1.3.232
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 1.3.231
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 1.3.230
Tue, 07 Jun 2022 09:37:05 GMT

_Version update only_

## 1.3.229
Wed, 25 May 2022 22:25:07 GMT

_Version update only_

## 1.3.228
Thu, 19 May 2022 15:13:20 GMT

_Version update only_

## 1.3.227
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 1.3.226
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 1.3.225
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 1.3.224
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 1.3.223
Sat, 23 Apr 2022 02:13:07 GMT

_Version update only_

## 1.3.222
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 1.3.221
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 1.3.220
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 1.3.219
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 1.3.218
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 1.3.217
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 1.3.216
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 1.3.215
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 1.3.214
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 1.3.213
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 1.3.212
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 1.3.211
Fri, 11 Feb 2022 10:30:26 GMT

_Version update only_

## 1.3.210
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 1.3.209
Fri, 21 Jan 2022 01:10:41 GMT

_Version update only_

## 1.3.208
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 1.3.207
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 1.3.206
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 1.3.205
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 1.3.204
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 1.3.203
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 1.3.202
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 1.3.201
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 1.3.200
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 1.3.199
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 1.3.198
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 1.3.197
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 1.3.196
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 1.3.195
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 1.3.194
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 1.3.193
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 1.3.192
Wed, 13 Oct 2021 15:09:55 GMT

_Version update only_

## 1.3.191
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 1.3.190
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 1.3.189
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 1.3.188
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 1.3.187
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 1.3.186
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 1.3.185
Tue, 05 Oct 2021 15:08:38 GMT

_Version update only_

## 1.3.184
Mon, 04 Oct 2021 15:10:18 GMT

_Version update only_

## 1.3.183
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 1.3.182
Thu, 23 Sep 2021 00:10:40 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 1.3.181
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 1.3.180
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 1.3.179
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 1.3.178
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 1.3.177
Mon, 13 Sep 2021 15:07:05 GMT

_Version update only_

## 1.3.176
Fri, 10 Sep 2021 15:08:28 GMT

_Version update only_

## 1.3.175
Wed, 08 Sep 2021 19:06:22 GMT

_Version update only_

## 1.3.174
Wed, 08 Sep 2021 00:08:03 GMT

_Version update only_

## 1.3.173
Fri, 03 Sep 2021 00:09:10 GMT

_Version update only_

## 1.3.172
Tue, 31 Aug 2021 00:07:11 GMT

_Version update only_

## 1.3.171
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 1.3.170
Fri, 20 Aug 2021 15:08:10 GMT

_Version update only_

## 1.3.169
Fri, 13 Aug 2021 00:09:14 GMT

_Version update only_

## 1.3.168
Thu, 12 Aug 2021 18:11:18 GMT

_Version update only_

## 1.3.167
Thu, 12 Aug 2021 01:28:38 GMT

_Version update only_

## 1.3.166
Wed, 11 Aug 2021 23:14:17 GMT

_Version update only_

## 1.3.165
Wed, 11 Aug 2021 00:07:21 GMT

_Version update only_

## 1.3.164
Sat, 31 Jul 2021 00:52:11 GMT

_Version update only_

## 1.3.163
Wed, 14 Jul 2021 15:06:29 GMT

_Version update only_

## 1.3.162
Tue, 13 Jul 2021 23:00:33 GMT

_Version update only_

## 1.3.161
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 1.3.160
Thu, 08 Jul 2021 23:41:17 GMT

_Version update only_

## 1.3.159
Thu, 08 Jul 2021 06:00:48 GMT

_Version update only_

## 1.3.158
Thu, 01 Jul 2021 15:08:27 GMT

_Version update only_

## 1.3.157
Wed, 30 Jun 2021 19:16:19 GMT

_Version update only_

## 1.3.156
Wed, 30 Jun 2021 15:06:54 GMT

_Version update only_

## 1.3.155
Wed, 30 Jun 2021 01:37:17 GMT

_Version update only_

## 1.3.154
Fri, 25 Jun 2021 00:08:28 GMT

_Version update only_

## 1.3.153
Fri, 18 Jun 2021 06:23:05 GMT

_Version update only_

## 1.3.152
Wed, 16 Jun 2021 18:53:52 GMT

_Version update only_

## 1.3.151
Wed, 16 Jun 2021 15:07:24 GMT

_Version update only_

## 1.3.150
Tue, 15 Jun 2021 20:38:35 GMT

_Version update only_

## 1.3.149
Fri, 11 Jun 2021 23:26:16 GMT

_Version update only_

## 1.3.148
Fri, 11 Jun 2021 00:34:02 GMT

_Version update only_

## 1.3.147
Thu, 10 Jun 2021 15:08:16 GMT

_Version update only_

## 1.3.146
Fri, 04 Jun 2021 19:59:53 GMT

_Version update only_

## 1.3.145
Fri, 04 Jun 2021 15:08:20 GMT

_Version update only_

## 1.3.144
Fri, 04 Jun 2021 00:08:34 GMT

_Version update only_

## 1.3.143
Tue, 01 Jun 2021 18:29:26 GMT

_Version update only_

## 1.3.142
Sat, 29 May 2021 01:05:06 GMT

_Version update only_

## 1.3.141
Fri, 28 May 2021 06:19:58 GMT

_Version update only_

## 1.3.140
Tue, 25 May 2021 00:12:21 GMT

_Version update only_

## 1.3.139
Wed, 19 May 2021 00:11:39 GMT

_Version update only_

## 1.3.138
Thu, 13 May 2021 01:52:46 GMT

_Version update only_

## 1.3.137
Tue, 11 May 2021 22:19:17 GMT

_Version update only_

## 1.3.136
Mon, 03 May 2021 15:10:28 GMT

_Version update only_

## 1.3.135
Thu, 29 Apr 2021 23:26:50 GMT

_Version update only_

## 1.3.134
Thu, 29 Apr 2021 01:07:29 GMT

_Version update only_

## 1.3.133
Fri, 23 Apr 2021 22:00:07 GMT

_Version update only_

## 1.3.132
Fri, 23 Apr 2021 15:11:21 GMT

_Version update only_

## 1.3.131
Wed, 21 Apr 2021 15:12:28 GMT

_Version update only_

## 1.3.130
Tue, 20 Apr 2021 04:59:51 GMT

_Version update only_

## 1.3.129
Thu, 15 Apr 2021 02:59:25 GMT

_Version update only_

## 1.3.128
Mon, 12 Apr 2021 15:10:29 GMT

_Version update only_

## 1.3.127
Thu, 08 Apr 2021 20:41:54 GMT

_Version update only_

## 1.3.126
Thu, 08 Apr 2021 06:05:32 GMT

_Version update only_

## 1.3.125
Thu, 08 Apr 2021 00:10:18 GMT

_Version update only_

## 1.3.124
Tue, 06 Apr 2021 15:14:22 GMT

_Version update only_

## 1.3.123
Wed, 31 Mar 2021 15:10:36 GMT

_Version update only_

## 1.3.122
Mon, 29 Mar 2021 05:02:07 GMT

_Version update only_

## 1.3.121
Fri, 19 Mar 2021 22:31:38 GMT

_Version update only_

## 1.3.120
Wed, 17 Mar 2021 05:04:38 GMT

_Version update only_

## 1.3.119
Fri, 12 Mar 2021 01:13:27 GMT

_Version update only_

## 1.3.118
Wed, 10 Mar 2021 06:23:29 GMT

_Version update only_

## 1.3.117
Wed, 10 Mar 2021 05:10:06 GMT

_Version update only_

## 1.3.116
Thu, 04 Mar 2021 01:11:31 GMT

_Version update only_

## 1.3.115
Tue, 02 Mar 2021 23:25:05 GMT

_Version update only_

## 1.3.114
Fri, 05 Feb 2021 16:10:42 GMT

_Version update only_

## 1.3.113
Fri, 22 Jan 2021 05:39:22 GMT

_Version update only_

## 1.3.112
Thu, 21 Jan 2021 04:19:00 GMT

_Version update only_

## 1.3.111
Wed, 13 Jan 2021 01:11:06 GMT

_Version update only_

## 1.3.110
Fri, 08 Jan 2021 07:28:50 GMT

_Version update only_

## 1.3.109
Wed, 06 Jan 2021 16:10:43 GMT

_Version update only_

## 1.3.108
Mon, 14 Dec 2020 16:12:21 GMT

_Version update only_

## 1.3.107
Thu, 10 Dec 2020 23:25:50 GMT

_Version update only_

## 1.3.106
Sat, 05 Dec 2020 01:11:23 GMT

_Version update only_

## 1.3.105
Tue, 01 Dec 2020 01:10:38 GMT

_Version update only_

## 1.3.104
Mon, 30 Nov 2020 16:11:50 GMT

_Version update only_

## 1.3.103
Wed, 18 Nov 2020 08:19:54 GMT

_Version update only_

## 1.3.102
Wed, 18 Nov 2020 06:21:58 GMT

_Version update only_

## 1.3.101
Tue, 17 Nov 2020 01:17:38 GMT

_Version update only_

## 1.3.100
Mon, 16 Nov 2020 01:57:58 GMT

_Version update only_

## 1.3.99
Fri, 13 Nov 2020 01:11:01 GMT

_Version update only_

## 1.3.98
Thu, 12 Nov 2020 01:11:10 GMT

_Version update only_

## 1.3.97
Wed, 11 Nov 2020 01:08:58 GMT

_Version update only_

## 1.3.96
Tue, 10 Nov 2020 23:13:11 GMT

_Version update only_

## 1.3.95
Tue, 10 Nov 2020 16:11:42 GMT

_Version update only_

## 1.3.94
Sun, 08 Nov 2020 22:52:49 GMT

_Version update only_

## 1.3.93
Fri, 06 Nov 2020 16:09:30 GMT

_Version update only_

## 1.3.92
Tue, 03 Nov 2020 01:11:19 GMT

_Version update only_

## 1.3.91
Mon, 02 Nov 2020 16:12:05 GMT

_Version update only_

## 1.3.90
Fri, 30 Oct 2020 06:38:39 GMT

_Version update only_

## 1.3.89
Fri, 30 Oct 2020 00:10:14 GMT

_Version update only_

## 1.3.88
Thu, 29 Oct 2020 06:14:19 GMT

_Version update only_

## 1.3.87
Thu, 29 Oct 2020 00:11:33 GMT

_Version update only_

## 1.3.86
Wed, 28 Oct 2020 01:18:03 GMT

_Version update only_

## 1.3.85
Tue, 27 Oct 2020 15:10:14 GMT

_Version update only_

## 1.3.84
Sat, 24 Oct 2020 00:11:19 GMT

_Version update only_

## 1.3.83
Wed, 21 Oct 2020 05:09:44 GMT

_Version update only_

## 1.3.82
Wed, 21 Oct 2020 02:28:17 GMT

_Version update only_

## 1.3.81
Fri, 16 Oct 2020 23:32:58 GMT

_Version update only_

## 1.3.80
Thu, 15 Oct 2020 00:59:08 GMT

_Version update only_

## 1.3.79
Wed, 14 Oct 2020 23:30:14 GMT

_Version update only_

## 1.3.78
Tue, 13 Oct 2020 15:11:28 GMT

_Version update only_

## 1.3.77
Mon, 12 Oct 2020 15:11:16 GMT

_Version update only_

## 1.3.76
Fri, 09 Oct 2020 15:11:09 GMT

_Version update only_

## 1.3.75
Tue, 06 Oct 2020 00:24:06 GMT

_Version update only_

## 1.3.74
Mon, 05 Oct 2020 22:36:57 GMT

_Version update only_

## 1.3.73
Mon, 05 Oct 2020 15:10:42 GMT

_Version update only_

## 1.3.72
Fri, 02 Oct 2020 00:10:59 GMT

_Version update only_

## 1.3.71
Thu, 01 Oct 2020 20:27:16 GMT

_Version update only_

## 1.3.70
Thu, 01 Oct 2020 18:51:21 GMT

_Version update only_

## 1.3.69
Wed, 30 Sep 2020 18:39:17 GMT

_Version update only_

## 1.3.68
Wed, 30 Sep 2020 06:53:53 GMT

### Patches

- Update README.md

## 1.3.67
Tue, 22 Sep 2020 05:45:57 GMT

_Version update only_

## 1.3.66
Tue, 22 Sep 2020 01:45:31 GMT

_Version update only_

## 1.3.65
Tue, 22 Sep 2020 00:08:53 GMT

_Version update only_

## 1.3.64
Sat, 19 Sep 2020 04:37:27 GMT

_Version update only_

## 1.3.63
Sat, 19 Sep 2020 03:33:07 GMT

_Version update only_

## 1.3.62
Fri, 18 Sep 2020 22:57:24 GMT

_Version update only_

## 1.3.61
Fri, 18 Sep 2020 21:49:53 GMT

_Version update only_

## 1.3.60
Wed, 16 Sep 2020 05:30:26 GMT

_Version update only_

## 1.3.59
Tue, 15 Sep 2020 01:51:37 GMT

_Version update only_

## 1.3.58
Mon, 14 Sep 2020 15:09:48 GMT

_Version update only_

## 1.3.57
Sun, 13 Sep 2020 01:53:20 GMT

_Version update only_

## 1.3.56
Fri, 11 Sep 2020 02:13:35 GMT

_Version update only_

## 1.3.55
Wed, 09 Sep 2020 03:29:01 GMT

_Version update only_

## 1.3.54
Wed, 09 Sep 2020 00:38:48 GMT

_Version update only_

## 1.3.53
Mon, 07 Sep 2020 07:37:37 GMT

_Version update only_

## 1.3.52
Sat, 05 Sep 2020 18:56:35 GMT

_Version update only_

## 1.3.51
Fri, 04 Sep 2020 15:06:28 GMT

_Version update only_

## 1.3.50
Thu, 03 Sep 2020 15:09:59 GMT

_Version update only_

## 1.3.49
Wed, 02 Sep 2020 23:01:13 GMT

_Version update only_

## 1.3.48
Wed, 02 Sep 2020 15:10:17 GMT

_Version update only_

## 1.3.47
Thu, 27 Aug 2020 11:27:06 GMT

_Version update only_

## 1.3.46
Tue, 25 Aug 2020 00:10:12 GMT

_Version update only_

## 1.3.45
Mon, 24 Aug 2020 07:35:21 GMT

_Version update only_

## 1.3.44
Sat, 22 Aug 2020 05:55:43 GMT

_Version update only_

## 1.3.43
Fri, 21 Aug 2020 01:21:18 GMT

_Version update only_

## 1.3.42
Thu, 20 Aug 2020 18:41:47 GMT

_Version update only_

## 1.3.41
Thu, 20 Aug 2020 15:13:53 GMT

_Version update only_

## 1.3.40
Tue, 18 Aug 2020 23:59:42 GMT

_Version update only_

## 1.3.39
Tue, 18 Aug 2020 03:03:24 GMT

_Version update only_

## 1.3.38
Mon, 17 Aug 2020 05:31:53 GMT

_Version update only_

## 1.3.37
Mon, 17 Aug 2020 04:53:23 GMT

_Version update only_

## 1.3.36
Thu, 13 Aug 2020 09:26:40 GMT

_Version update only_

## 1.3.35
Thu, 13 Aug 2020 04:57:38 GMT

_Version update only_

## 1.3.34
Wed, 12 Aug 2020 00:10:05 GMT

### Patches

- Updated project to build with Heft

## 1.3.33
Wed, 05 Aug 2020 18:27:32 GMT

_Version update only_

## 1.3.32
Fri, 03 Jul 2020 15:09:04 GMT

_Version update only_

## 1.3.31
Fri, 03 Jul 2020 05:46:42 GMT

_Version update only_

## 1.3.30
Sat, 27 Jun 2020 00:09:38 GMT

_Version update only_

## 1.3.29
Fri, 26 Jun 2020 22:16:39 GMT

_Version update only_

## 1.3.28
Thu, 25 Jun 2020 06:43:35 GMT

_Version update only_

## 1.3.27
Wed, 24 Jun 2020 09:50:48 GMT

_Version update only_

## 1.3.26
Wed, 24 Jun 2020 09:04:28 GMT

_Version update only_

## 1.3.25
Mon, 15 Jun 2020 22:17:18 GMT

_Version update only_

## 1.3.24
Fri, 12 Jun 2020 09:19:21 GMT

_Version update only_

## 1.3.23
Wed, 10 Jun 2020 20:48:30 GMT

_Version update only_

## 1.3.22
Mon, 01 Jun 2020 08:34:17 GMT

_Version update only_

## 1.3.21
Sat, 30 May 2020 02:59:54 GMT

_Version update only_

## 1.3.20
Thu, 28 May 2020 05:59:02 GMT

_Version update only_

## 1.3.19
Wed, 27 May 2020 05:15:11 GMT

_Version update only_

## 1.3.18
Tue, 26 May 2020 23:00:25 GMT

_Version update only_

## 1.3.17
Fri, 22 May 2020 15:08:42 GMT

_Version update only_

## 1.3.16
Thu, 21 May 2020 23:09:44 GMT

_Version update only_

## 1.3.15
Thu, 21 May 2020 15:42:00 GMT

_Version update only_

## 1.3.14
Tue, 19 May 2020 15:08:20 GMT

_Version update only_

## 1.3.13
Fri, 15 May 2020 08:10:59 GMT

_Version update only_

## 1.3.12
Wed, 06 May 2020 08:23:45 GMT

_Version update only_

## 1.3.11
Sat, 02 May 2020 00:08:16 GMT

_Version update only_

## 1.3.10
Wed, 08 Apr 2020 04:07:33 GMT

_Version update only_

## 1.3.9
Fri, 03 Apr 2020 15:10:15 GMT

_Version update only_

## 1.3.8
Sun, 29 Mar 2020 00:04:12 GMT

_Version update only_

## 1.3.7
Sat, 28 Mar 2020 00:37:16 GMT

_Version update only_

## 1.3.6
Wed, 18 Mar 2020 15:07:47 GMT

_Version update only_

## 1.3.5
Tue, 17 Mar 2020 23:55:58 GMT

### Patches

- PACKAGE NAME CHANGE: The NPM scope was changed from `@microsoft/loader-raw-script` to `@rushstack/loader-raw-script`

## 1.3.4
Tue, 28 Jan 2020 02:23:44 GMT

_Version update only_

## 1.3.3
Fri, 24 Jan 2020 00:27:39 GMT

_Version update only_

## 1.3.2
Thu, 23 Jan 2020 01:07:56 GMT

_Version update only_

## 1.3.1
Tue, 21 Jan 2020 21:56:14 GMT

_Version update only_

## 1.3.0
Sun, 19 Jan 2020 02:26:52 GMT

### Minor changes

- Upgrade Node typings to Node 10

## 1.2.200
Fri, 17 Jan 2020 01:08:23 GMT

_Version update only_

## 1.2.199
Tue, 14 Jan 2020 01:34:15 GMT

_Version update only_

## 1.2.198
Sat, 11 Jan 2020 05:18:23 GMT

_Version update only_

## 1.2.197
Thu, 09 Jan 2020 06:44:13 GMT

_Version update only_

## 1.2.196
Wed, 08 Jan 2020 00:11:31 GMT

_Version update only_

## 1.2.195
Wed, 04 Dec 2019 23:17:55 GMT

_Version update only_

## 1.2.194
Tue, 03 Dec 2019 03:17:44 GMT

_Version update only_

## 1.2.193
Sun, 24 Nov 2019 00:54:04 GMT

_Version update only_

## 1.2.192
Wed, 20 Nov 2019 06:14:28 GMT

_Version update only_

## 1.2.191
Fri, 15 Nov 2019 04:50:50 GMT

_Version update only_

## 1.2.190
Mon, 11 Nov 2019 16:07:56 GMT

_Version update only_

## 1.2.189
Wed, 06 Nov 2019 22:44:18 GMT

_Version update only_

## 1.2.188
Tue, 05 Nov 2019 06:49:29 GMT

_Version update only_

## 1.2.187
Tue, 05 Nov 2019 01:08:39 GMT

_Version update only_

## 1.2.186
Fri, 25 Oct 2019 15:08:54 GMT

_Version update only_

## 1.2.185
Tue, 22 Oct 2019 06:24:44 GMT

_Version update only_

## 1.2.184
Mon, 21 Oct 2019 05:22:43 GMT

_Version update only_

## 1.2.183
Fri, 18 Oct 2019 15:15:01 GMT

_Version update only_

## 1.2.182
Sun, 06 Oct 2019 00:27:39 GMT

_Version update only_

## 1.2.181
Fri, 04 Oct 2019 00:15:22 GMT

_Version update only_

## 1.2.180
Sun, 29 Sep 2019 23:56:29 GMT

### Patches

- Update repository URL

## 1.2.179
Wed, 25 Sep 2019 15:15:31 GMT

_Version update only_

## 1.2.178
Tue, 24 Sep 2019 02:58:49 GMT

_Version update only_

## 1.2.177
Mon, 23 Sep 2019 15:14:55 GMT

_Version update only_

## 1.2.176
Fri, 20 Sep 2019 21:27:22 GMT

_Version update only_

## 1.2.175
Wed, 11 Sep 2019 19:56:23 GMT

_Version update only_

## 1.2.174
Tue, 10 Sep 2019 22:32:23 GMT

_Version update only_

## 1.2.173
Tue, 10 Sep 2019 20:38:33 GMT

_Version update only_

## 1.2.172
Wed, 04 Sep 2019 18:28:06 GMT

_Version update only_

## 1.2.171
Wed, 04 Sep 2019 15:15:37 GMT

_Version update only_

## 1.2.170
Fri, 30 Aug 2019 00:14:32 GMT

_Version update only_

## 1.2.169
Mon, 12 Aug 2019 15:15:14 GMT

_Version update only_

## 1.2.168
Thu, 08 Aug 2019 15:14:17 GMT

_Version update only_

## 1.2.167
Thu, 08 Aug 2019 00:49:05 GMT

_Version update only_

## 1.2.166
Mon, 05 Aug 2019 22:04:32 GMT

_Version update only_

## 1.2.165
Tue, 23 Jul 2019 19:14:38 GMT

_Version update only_

## 1.2.164
Tue, 23 Jul 2019 01:13:01 GMT

_Version update only_

## 1.2.163
Mon, 22 Jul 2019 19:13:10 GMT

_Version update only_

## 1.2.162
Fri, 12 Jul 2019 19:12:46 GMT

_Version update only_

## 1.2.161
Thu, 11 Jul 2019 19:13:08 GMT

_Version update only_

## 1.2.160
Tue, 09 Jul 2019 19:13:24 GMT

_Version update only_

## 1.2.159
Mon, 08 Jul 2019 19:12:18 GMT

_Version update only_

## 1.2.158
Sat, 29 Jun 2019 02:30:10 GMT

_Version update only_

## 1.2.157
Wed, 12 Jun 2019 19:12:33 GMT

_Version update only_

## 1.2.156
Tue, 11 Jun 2019 00:48:06 GMT

_Version update only_

## 1.2.155
Thu, 06 Jun 2019 22:33:36 GMT

_Version update only_

## 1.2.154
Wed, 05 Jun 2019 19:12:34 GMT

_Version update only_

## 1.2.153
Tue, 04 Jun 2019 05:51:54 GMT

_Version update only_

## 1.2.152
Mon, 27 May 2019 04:13:44 GMT

_Version update only_

## 1.2.151
Mon, 13 May 2019 02:08:35 GMT

_Version update only_

## 1.2.150
Mon, 06 May 2019 20:46:22 GMT

_Version update only_

## 1.2.149
Mon, 06 May 2019 19:34:54 GMT

_Version update only_

## 1.2.148
Mon, 06 May 2019 19:11:16 GMT

_Version update only_

## 1.2.147
Tue, 30 Apr 2019 23:08:02 GMT

_Version update only_

## 1.2.146
Tue, 16 Apr 2019 11:01:37 GMT

_Version update only_

## 1.2.145
Fri, 12 Apr 2019 06:13:17 GMT

_Version update only_

## 1.2.144
Thu, 11 Apr 2019 07:14:01 GMT

_Version update only_

## 1.2.143
Tue, 09 Apr 2019 05:31:01 GMT

_Version update only_

## 1.2.142
Mon, 08 Apr 2019 19:12:53 GMT

_Version update only_

## 1.2.141
Sat, 06 Apr 2019 02:05:51 GMT

_Version update only_

## 1.2.140
Fri, 05 Apr 2019 04:16:17 GMT

_Version update only_

## 1.2.139
Wed, 03 Apr 2019 02:58:33 GMT

_Version update only_

## 1.2.138
Tue, 02 Apr 2019 01:12:02 GMT

_Version update only_

## 1.2.137
Sat, 30 Mar 2019 22:27:16 GMT

_Version update only_

## 1.2.136
Thu, 28 Mar 2019 19:14:27 GMT

_Version update only_

## 1.2.135
Tue, 26 Mar 2019 20:54:18 GMT

_Version update only_

## 1.2.134
Sat, 23 Mar 2019 03:48:31 GMT

_Version update only_

## 1.2.133
Thu, 21 Mar 2019 04:59:11 GMT

_Version update only_

## 1.2.132
Thu, 21 Mar 2019 01:15:33 GMT

_Version update only_

## 1.2.131
Wed, 20 Mar 2019 19:14:49 GMT

_Version update only_

## 1.2.130
Mon, 18 Mar 2019 04:28:43 GMT

_Version update only_

## 1.2.129
Fri, 15 Mar 2019 19:13:25 GMT

_Version update only_

## 1.2.128
Wed, 13 Mar 2019 19:13:14 GMT

_Version update only_

## 1.2.127
Wed, 13 Mar 2019 01:14:05 GMT

_Version update only_

## 1.2.126
Mon, 11 Mar 2019 16:13:36 GMT

_Version update only_

## 1.2.125
Tue, 05 Mar 2019 17:13:11 GMT

_Version update only_

## 1.2.124
Mon, 04 Mar 2019 17:13:19 GMT

_Version update only_

## 1.2.123
Wed, 27 Feb 2019 22:13:58 GMT

_Version update only_

## 1.2.122
Wed, 27 Feb 2019 17:13:17 GMT

_Version update only_

## 1.2.121
Mon, 18 Feb 2019 17:13:23 GMT

_Version update only_

## 1.2.120
Tue, 12 Feb 2019 17:13:12 GMT

_Version update only_

## 1.2.119
Mon, 11 Feb 2019 10:32:37 GMT

_Version update only_

## 1.2.118
Mon, 11 Feb 2019 03:31:55 GMT

_Version update only_

## 1.2.117
Wed, 30 Jan 2019 20:49:12 GMT

_Version update only_

## 1.2.116
Sat, 19 Jan 2019 03:47:47 GMT

_Version update only_

## 1.2.115
Tue, 15 Jan 2019 17:04:09 GMT

_Version update only_

## 1.2.114
Thu, 10 Jan 2019 01:57:53 GMT

_Version update only_

## 1.2.113
Mon, 07 Jan 2019 17:04:07 GMT

_Version update only_

## 1.2.112
Wed, 19 Dec 2018 05:57:33 GMT

_Version update only_

## 1.2.111
Thu, 13 Dec 2018 02:58:11 GMT

_Version update only_

## 1.2.110
Wed, 12 Dec 2018 17:04:19 GMT

_Version update only_

## 1.2.109
Sat, 08 Dec 2018 06:35:36 GMT

_Version update only_

## 1.2.108
Fri, 07 Dec 2018 17:04:56 GMT

_Version update only_

## 1.2.107
Fri, 30 Nov 2018 23:34:58 GMT

_Version update only_

## 1.2.106
Thu, 29 Nov 2018 07:02:09 GMT

_Version update only_

## 1.2.105
Thu, 29 Nov 2018 00:35:39 GMT

_Version update only_

## 1.2.104
Wed, 28 Nov 2018 19:29:53 GMT

_Version update only_

## 1.2.103
Wed, 28 Nov 2018 02:17:11 GMT

_Version update only_

## 1.2.102
Fri, 16 Nov 2018 21:37:10 GMT

_Version update only_

## 1.2.101
Fri, 16 Nov 2018 00:59:00 GMT

_Version update only_

## 1.2.100
Fri, 09 Nov 2018 23:07:39 GMT

_Version update only_

## 1.2.99
Wed, 07 Nov 2018 21:04:35 GMT

_Version update only_

## 1.2.98
Wed, 07 Nov 2018 17:03:03 GMT

_Version update only_

## 1.2.97
Mon, 05 Nov 2018 17:04:24 GMT

_Version update only_

## 1.2.96
Thu, 01 Nov 2018 21:33:52 GMT

_Version update only_

## 1.2.95
Thu, 01 Nov 2018 19:32:52 GMT

_Version update only_

## 1.2.94
Wed, 31 Oct 2018 21:17:50 GMT

_Version update only_

## 1.2.93
Wed, 31 Oct 2018 17:00:55 GMT

_Version update only_

## 1.2.92
Sat, 27 Oct 2018 03:45:51 GMT

_Version update only_

## 1.2.91
Sat, 27 Oct 2018 02:17:18 GMT

_Version update only_

## 1.2.90
Sat, 27 Oct 2018 00:26:56 GMT

_Version update only_

## 1.2.89
Thu, 25 Oct 2018 23:20:40 GMT

_Version update only_

## 1.2.88
Thu, 25 Oct 2018 08:56:02 GMT

_Version update only_

## 1.2.87
Wed, 24 Oct 2018 16:03:10 GMT

_Version update only_

## 1.2.86
Thu, 18 Oct 2018 05:30:14 GMT

_Version update only_

## 1.2.85
Thu, 18 Oct 2018 01:32:21 GMT

_Version update only_

## 1.2.84
Wed, 17 Oct 2018 21:04:49 GMT

_Version update only_

## 1.2.83
Wed, 17 Oct 2018 14:43:24 GMT

_Version update only_

## 1.2.82
Thu, 11 Oct 2018 23:26:07 GMT

_Version update only_

## 1.2.81
Tue, 09 Oct 2018 06:58:02 GMT

_Version update only_

## 1.2.80
Mon, 08 Oct 2018 16:04:27 GMT

_Version update only_

## 1.2.79
Sun, 07 Oct 2018 06:15:56 GMT

_Version update only_

## 1.2.78
Fri, 28 Sep 2018 16:05:35 GMT

_Version update only_

## 1.2.77
Wed, 26 Sep 2018 21:39:40 GMT

_Version update only_

## 1.2.76
Mon, 24 Sep 2018 23:06:40 GMT

_Version update only_

## 1.2.75
Mon, 24 Sep 2018 16:04:28 GMT

_Version update only_

## 1.2.74
Fri, 21 Sep 2018 16:04:42 GMT

_Version update only_

## 1.2.73
Thu, 20 Sep 2018 23:57:22 GMT

_Version update only_

## 1.2.72
Tue, 18 Sep 2018 21:04:55 GMT

_Version update only_

## 1.2.71
Mon, 10 Sep 2018 23:23:01 GMT

_Version update only_

## 1.2.70
Thu, 06 Sep 2018 01:25:26 GMT

### Patches

- Update "repository" field in package.json

## 1.2.69
Tue, 04 Sep 2018 21:34:10 GMT

_Version update only_

## 1.2.68
Mon, 03 Sep 2018 16:04:46 GMT

_Version update only_

## 1.2.67
Thu, 30 Aug 2018 22:47:34 GMT

_Version update only_

## 1.2.66
Thu, 30 Aug 2018 19:23:16 GMT

_Version update only_

## 1.2.65
Thu, 30 Aug 2018 18:45:12 GMT

_Version update only_

## 1.2.64
Wed, 29 Aug 2018 21:43:23 GMT

_Version update only_

## 1.2.63
Wed, 29 Aug 2018 06:36:50 GMT

_Version update only_

## 1.2.62
Thu, 23 Aug 2018 18:18:53 GMT

### Patches

- Republish all packages in web-build-tools to resolve GitHub issue #782

## 1.2.61
Wed, 22 Aug 2018 20:58:58 GMT

_Version update only_

## 1.2.60
Wed, 22 Aug 2018 16:03:25 GMT

_Version update only_

## 1.2.59
Tue, 21 Aug 2018 16:04:38 GMT

_Version update only_

## 1.2.58
Thu, 09 Aug 2018 21:58:02 GMT

_Version update only_

## 1.2.57
Thu, 09 Aug 2018 21:03:22 GMT

_Version update only_

## 1.2.56
Thu, 09 Aug 2018 16:04:24 GMT

_Version update only_

## 1.2.55
Tue, 07 Aug 2018 22:27:31 GMT

_Version update only_

## 1.2.54
Thu, 26 Jul 2018 23:53:43 GMT

_Version update only_

## 1.2.53
Thu, 26 Jul 2018 16:04:17 GMT

_Version update only_

## 1.2.52
Wed, 25 Jul 2018 21:02:57 GMT

_Version update only_

## 1.2.51
Fri, 20 Jul 2018 16:04:52 GMT

_Version update only_

## 1.2.50
Tue, 17 Jul 2018 16:02:52 GMT

_Version update only_

## 1.2.49
Fri, 13 Jul 2018 19:04:50 GMT

_Version update only_

## 1.2.48
Tue, 03 Jul 2018 21:03:31 GMT

_Version update only_

## 1.2.47
Fri, 29 Jun 2018 02:56:51 GMT

_Version update only_

## 1.2.46
Sat, 23 Jun 2018 02:21:20 GMT

_Version update only_

## 1.2.45
Fri, 22 Jun 2018 16:05:15 GMT

_Version update only_

## 1.2.44
Thu, 21 Jun 2018 08:27:29 GMT

_Version update only_

## 1.2.43
Tue, 19 Jun 2018 19:35:11 GMT

_Version update only_

## 1.2.42
Fri, 08 Jun 2018 08:43:52 GMT

_Version update only_

## 1.2.41
Thu, 31 May 2018 01:39:33 GMT

_Version update only_

## 1.2.40
Tue, 15 May 2018 02:26:45 GMT

_Version update only_

## 1.2.39
Tue, 15 May 2018 00:18:10 GMT

_Version update only_

## 1.2.38
Fri, 11 May 2018 22:43:14 GMT

_Version update only_

## 1.2.37
Fri, 04 May 2018 00:42:38 GMT

_Version update only_

## 1.2.36
Tue, 01 May 2018 22:03:20 GMT

_Version update only_

## 1.2.35
Fri, 27 Apr 2018 03:04:32 GMT

_Version update only_

## 1.2.34
Fri, 20 Apr 2018 16:06:11 GMT

_Version update only_

## 1.2.33
Thu, 19 Apr 2018 21:25:56 GMT

_Version update only_

## 1.2.32
Thu, 19 Apr 2018 17:02:06 GMT

_Version update only_

## 1.2.31
Tue, 03 Apr 2018 16:05:29 GMT

_Version update only_

## 1.2.30
Mon, 02 Apr 2018 16:05:24 GMT

_Version update only_

## 1.2.29
Tue, 27 Mar 2018 01:34:25 GMT

_Version update only_

## 1.2.28
Mon, 26 Mar 2018 19:12:42 GMT

_Version update only_

## 1.2.27
Sun, 25 Mar 2018 01:26:19 GMT

_Version update only_

## 1.2.26
Fri, 23 Mar 2018 00:34:53 GMT

_Version update only_

## 1.2.25
Thu, 22 Mar 2018 18:34:13 GMT

_Version update only_

## 1.2.24
Tue, 20 Mar 2018 02:44:45 GMT

_Version update only_

## 1.2.23
Sat, 17 Mar 2018 02:54:22 GMT

_Version update only_

## 1.2.22
Thu, 15 Mar 2018 20:00:50 GMT

_Version update only_

## 1.2.21
Thu, 15 Mar 2018 16:05:43 GMT

_Version update only_

## 1.2.20
Tue, 13 Mar 2018 23:11:32 GMT

_Version update only_

## 1.2.19
Mon, 12 Mar 2018 20:36:19 GMT

_Version update only_

## 1.2.18
Tue, 06 Mar 2018 17:04:51 GMT

_Version update only_

## 1.2.17
Fri, 02 Mar 2018 01:13:59 GMT

_Version update only_

## 1.2.16
Tue, 27 Feb 2018 22:05:57 GMT

_Version update only_

## 1.2.15
Wed, 21 Feb 2018 22:04:19 GMT

_Version update only_

## 1.2.14
Wed, 21 Feb 2018 03:13:29 GMT

_Version update only_

## 1.2.13
Sat, 17 Feb 2018 02:53:49 GMT

_Version update only_

## 1.2.12
Fri, 16 Feb 2018 22:05:23 GMT

_Version update only_

## 1.2.11
Fri, 16 Feb 2018 17:05:11 GMT

_Version update only_

## 1.2.10
Wed, 07 Feb 2018 17:05:11 GMT

_Version update only_

## 1.2.9
Fri, 26 Jan 2018 22:05:30 GMT

_Version update only_

## 1.2.8
Fri, 26 Jan 2018 17:53:38 GMT

### Patches

- Force a patch bump in case the previous version was an empty package

## 1.2.7
Fri, 26 Jan 2018 00:36:51 GMT

_Version update only_

## 1.2.6
Tue, 23 Jan 2018 17:05:28 GMT

_Version update only_

## 1.2.5
Thu, 18 Jan 2018 03:23:46 GMT

_Version update only_

## 1.2.4
Thu, 18 Jan 2018 00:48:06 GMT

_Version update only_

## 1.2.3
Wed, 17 Jan 2018 10:49:31 GMT

_Version update only_

## 1.2.2
Fri, 12 Jan 2018 03:35:22 GMT

_Version update only_

## 1.2.1
Thu, 11 Jan 2018 22:31:51 GMT

_Version update only_

## 1.2.0
Wed, 10 Jan 2018 20:40:01 GMT

### Minor changes

- Upgrade to Node 8

## 1.1.13
Sun, 07 Jan 2018 05:12:08 GMT

_Version update only_

## 1.1.12
Fri, 05 Jan 2018 20:26:45 GMT

_Version update only_

## 1.1.11
Fri, 05 Jan 2018 00:48:41 GMT

_Version update only_

## 1.1.10
Fri, 22 Dec 2017 17:04:46 GMT

_Version update only_

## 1.1.9
Tue, 12 Dec 2017 03:33:26 GMT

_Version update only_

## 1.1.8
Thu, 30 Nov 2017 23:59:09 GMT

_Version update only_

## 1.1.7
Thu, 30 Nov 2017 23:12:21 GMT

_Version update only_

## 1.1.6
Wed, 29 Nov 2017 17:05:37 GMT

_Version update only_

## 1.1.5
Tue, 28 Nov 2017 23:43:55 GMT

_Version update only_

## 1.1.4
Mon, 13 Nov 2017 17:04:50 GMT

_Version update only_

## 1.1.3
Mon, 06 Nov 2017 17:04:18 GMT

_Version update only_

## 1.1.2
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 1.1.1
Tue, 24 Oct 2017 18:17:12 GMT

_Version update only_

## 1.1.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 1.0.6
Tue, 19 Sep 2017 19:04:50 GMT

### Patches

- Minor README correction.

## 1.0.5
Thu, 31 Aug 2017 18:41:18 GMT

_Version update only_

## 1.0.4
Wed, 30 Aug 2017 01:04:34 GMT

_Version update only_

## 1.0.3
Tue, 22 Aug 2017 13:04:22 GMT

_Version update only_

## 1.0.2
Tue, 28 Feb 2017 02:01:29 GMT

### Patches

- Updating loader-utils to 1.0.2

## 1.0.1
Tue, 07 Feb 2017 14:32:21 GMT

### Patches

- Updating npmignore.

## 1.0.0
Tue, 07 Feb 2017 05:26:57 GMT

### Breaking changes

- Setting up loader-raw-script.

