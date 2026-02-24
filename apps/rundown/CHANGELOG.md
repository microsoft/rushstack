# Change Log - @rushstack/rundown

This log was last generated on Tue, 24 Feb 2026 01:13:27 GMT and should not be manually modified.

## 1.3.4
Tue, 24 Feb 2026 01:13:27 GMT

_Version update only_

## 1.3.3
Mon, 23 Feb 2026 00:42:21 GMT

_Version update only_

## 1.3.2
Fri, 20 Feb 2026 16:14:49 GMT

_Version update only_

## 1.3.1
Fri, 20 Feb 2026 00:15:04 GMT

### Patches

- Add `"node"` condition before `"import"` in the `"exports"` map so that Node.js uses the CJS output (which handles extensionless imports), while bundlers still use ESM via `"import"`. Fixes https://github.com/microsoft/rushstack/issues/5644.

## 1.3.0
Thu, 19 Feb 2026 00:04:53 GMT

### Minor changes

- Normalize package layout. CommonJS is now under `lib-commonjs`, DTS is now under `lib-dts`, and ESM is now under `lib-esm`. Imports to `lib` still work as before, handled by the `"exports"` field in `package.json`.

## 1.2.14
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 1.2.13
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 1.2.12
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 1.2.11
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 1.2.10
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 1.2.9
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 1.2.8
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 1.2.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 1.2.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 1.2.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 1.2.4
Tue, 04 Nov 2025 08:15:15 GMT

_Version update only_

## 1.2.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 1.2.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 1.2.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 1.2.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 1.1.110
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 1.1.109
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 1.1.108
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 1.1.107
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 1.1.106
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 1.1.105
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 1.1.104
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 1.1.103
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 1.1.102
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 1.1.101
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 1.1.100
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 1.1.99
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 1.1.98
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 1.1.97
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 1.1.96
Tue, 15 Apr 2025 15:11:58 GMT

_Version update only_

## 1.1.95
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 1.1.94
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 1.1.93
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 1.1.92
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 1.1.91
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 1.1.90
Tue, 11 Mar 2025 02:12:34 GMT

_Version update only_

## 1.1.89
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 1.1.88
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 1.1.87
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 1.1.86
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 1.1.85
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 1.1.84
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 1.1.83
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 1.1.82
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 1.1.81
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 1.1.80
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 1.1.79
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 1.1.78
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 1.1.77
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 1.1.76
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 1.1.75
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 1.1.74
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 1.1.73
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 1.1.72
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 1.1.71
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 1.1.70
Tue, 15 Oct 2024 00:12:32 GMT

_Version update only_

## 1.1.69
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 1.1.68
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 1.1.67
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 1.1.66
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 1.1.65
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 1.1.64
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 1.1.63
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 1.1.62
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 1.1.61
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 1.1.60
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 1.1.59
Wed, 17 Jul 2024 06:55:10 GMT

_Version update only_

## 1.1.58
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 1.1.57
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 1.1.56
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 1.1.55
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 1.1.54
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 1.1.53
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 1.1.52
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 1.1.51
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 1.1.50
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 1.1.49
Sat, 25 May 2024 04:54:08 GMT

_Version update only_

## 1.1.48
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 1.1.47
Thu, 23 May 2024 02:26:56 GMT

### Patches

- Eliminate an arbitrary 500ms delay during process shutdown

## 1.1.46
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 1.1.45
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 1.1.44
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 1.1.43
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 1.1.42
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 1.1.41
Mon, 06 May 2024 15:11:05 GMT

_Version update only_

## 1.1.40
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 1.1.39
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 1.1.38
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 1.1.37
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 1.1.36
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 1.1.35
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 1.1.34
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 1.1.33
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 1.1.32
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 1.1.31
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 1.1.30
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 1.1.29
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 1.1.28
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 1.1.27
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 1.1.26
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 1.1.25
Mon, 19 Feb 2024 21:54:27 GMT

_Version update only_

## 1.1.24
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 1.1.23
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 1.1.22
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 1.1.21
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 1.1.20
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 1.1.19
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 1.1.18
Tue, 23 Jan 2024 16:15:06 GMT

_Version update only_

## 1.1.17
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 1.1.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 1.1.15
Wed, 20 Dec 2023 01:09:46 GMT

_Version update only_

## 1.1.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 1.1.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 1.1.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 1.1.11
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 1.1.10
Mon, 30 Oct 2023 23:36:38 GMT

_Version update only_

## 1.1.9
Sun, 01 Oct 2023 02:56:30 GMT

_Version update only_

## 1.1.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 1.1.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 1.1.6
Wed, 27 Sep 2023 00:21:39 GMT

_Version update only_

## 1.1.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 1.1.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 1.1.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 1.1.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 1.1.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 1.1.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 1.0.277
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 1.0.276
Mon, 31 Jul 2023 15:19:06 GMT

_Version update only_

## 1.0.275
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 1.0.274
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 1.0.273
Wed, 19 Jul 2023 00:20:32 GMT

_Version update only_

## 1.0.272
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 1.0.271
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 1.0.270
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 1.0.269
Wed, 12 Jul 2023 00:23:30 GMT

_Version update only_

## 1.0.268
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 1.0.267
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 1.0.266
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 1.0.265
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 1.0.264
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 1.0.263
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 1.0.262
Tue, 13 Jun 2023 15:17:21 GMT

_Version update only_

## 1.0.261
Tue, 13 Jun 2023 01:49:02 GMT

_Version update only_

## 1.0.260
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 1.0.259
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 1.0.258
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 1.0.257
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 1.0.256
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 1.0.255
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 1.0.254
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 1.0.253
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 1.0.252
Fri, 02 Jun 2023 02:01:12 GMT

_Version update only_

## 1.0.251
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 1.0.250
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 1.0.249
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 1.0.248
Thu, 04 May 2023 00:20:29 GMT

_Version update only_

## 1.0.247
Mon, 01 May 2023 15:23:20 GMT

_Version update only_

## 1.0.246
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 1.0.245
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 1.0.244
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 1.0.243
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 1.0.242
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 1.0.241
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 1.0.240
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 1.0.239
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 1.0.238
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 1.0.237
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 1.0.236
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 1.0.235
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 1.0.234
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 1.0.233
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 1.0.232
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 1.0.231
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 1.0.230
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 1.0.229
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 1.0.228
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 1.0.227
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 1.0.226
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 1.0.225
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 1.0.224
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 1.0.223
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 1.0.222
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 1.0.221
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 1.0.220
Thu, 15 Sep 2022 00:18:52 GMT

_Version update only_

## 1.0.219
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 1.0.218
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 1.0.217
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 1.0.216
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 1.0.215
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 1.0.214
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 1.0.213
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 1.0.212
Fri, 19 Aug 2022 00:17:20 GMT

_Version update only_

## 1.0.211
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 1.0.210
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 1.0.209
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 1.0.208
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 1.0.207
Thu, 21 Jul 2022 23:30:28 GMT

_Version update only_

## 1.0.206
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 1.0.205
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 1.0.204
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 1.0.203
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 1.0.202
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 1.0.201
Tue, 28 Jun 2022 22:47:14 GMT

_Version update only_

## 1.0.200
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 1.0.199
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 1.0.198
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 1.0.197
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 1.0.196
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 1.0.195
Thu, 23 Jun 2022 22:14:25 GMT

_Version update only_

## 1.0.194
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 1.0.193
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 1.0.192
Tue, 07 Jun 2022 09:37:05 GMT

_Version update only_

## 1.0.191
Wed, 25 May 2022 22:25:08 GMT

_Version update only_

## 1.0.190
Thu, 19 May 2022 15:13:21 GMT

_Version update only_

## 1.0.189
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 1.0.188
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 1.0.187
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 1.0.186
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 1.0.185
Sat, 23 Apr 2022 02:13:07 GMT

_Version update only_

## 1.0.184
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 1.0.183
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 1.0.182
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 1.0.181
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 1.0.180
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 1.0.179
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 1.0.178
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 1.0.177
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 1.0.176
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 1.0.175
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 1.0.174
Tue, 15 Mar 2022 19:15:54 GMT

_Version update only_

## 1.0.173
Fri, 11 Feb 2022 10:30:26 GMT

_Version update only_

## 1.0.172
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 1.0.171
Fri, 21 Jan 2022 01:10:41 GMT

_Version update only_

## 1.0.170
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 1.0.169
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 1.0.168
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 1.0.167
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 1.0.166
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 1.0.165
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 1.0.164
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 1.0.163
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 1.0.162
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 1.0.161
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 1.0.160
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 1.0.159
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 1.0.158
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 1.0.157
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 1.0.156
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 1.0.155
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 1.0.154
Wed, 13 Oct 2021 15:09:55 GMT

_Version update only_

## 1.0.153
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 1.0.152
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 1.0.151
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 1.0.150
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 1.0.149
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 1.0.148
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 1.0.147
Tue, 05 Oct 2021 15:08:38 GMT

_Version update only_

## 1.0.146
Mon, 04 Oct 2021 15:10:18 GMT

_Version update only_

## 1.0.145
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 1.0.144
Thu, 23 Sep 2021 00:10:41 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 1.0.143
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 1.0.142
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 1.0.141
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 1.0.140
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 1.0.139
Mon, 13 Sep 2021 15:07:05 GMT

_Version update only_

## 1.0.138
Fri, 10 Sep 2021 15:08:28 GMT

_Version update only_

## 1.0.137
Wed, 08 Sep 2021 19:06:22 GMT

_Version update only_

## 1.0.136
Wed, 08 Sep 2021 00:08:03 GMT

_Version update only_

## 1.0.135
Fri, 03 Sep 2021 00:09:10 GMT

_Version update only_

## 1.0.134
Tue, 31 Aug 2021 00:07:11 GMT

_Version update only_

## 1.0.133
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 1.0.132
Fri, 20 Aug 2021 15:08:10 GMT

_Version update only_

## 1.0.131
Fri, 13 Aug 2021 00:09:14 GMT

_Version update only_

## 1.0.130
Thu, 12 Aug 2021 18:11:18 GMT

_Version update only_

## 1.0.129
Thu, 12 Aug 2021 01:28:38 GMT

_Version update only_

## 1.0.128
Wed, 11 Aug 2021 23:14:17 GMT

_Version update only_

## 1.0.127
Wed, 11 Aug 2021 00:07:21 GMT

_Version update only_

## 1.0.126
Sat, 31 Jul 2021 00:52:11 GMT

_Version update only_

## 1.0.125
Wed, 14 Jul 2021 15:06:29 GMT

_Version update only_

## 1.0.124
Tue, 13 Jul 2021 23:00:33 GMT

_Version update only_

## 1.0.123
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 1.0.122
Thu, 08 Jul 2021 23:41:17 GMT

_Version update only_

## 1.0.121
Thu, 08 Jul 2021 06:00:48 GMT

_Version update only_

## 1.0.120
Thu, 01 Jul 2021 15:08:27 GMT

_Version update only_

## 1.0.119
Wed, 30 Jun 2021 19:16:19 GMT

_Version update only_

## 1.0.118
Wed, 30 Jun 2021 15:06:54 GMT

_Version update only_

## 1.0.117
Wed, 30 Jun 2021 01:37:17 GMT

_Version update only_

## 1.0.116
Fri, 25 Jun 2021 00:08:28 GMT

_Version update only_

## 1.0.115
Fri, 18 Jun 2021 06:23:05 GMT

_Version update only_

## 1.0.114
Wed, 16 Jun 2021 18:53:52 GMT

_Version update only_

## 1.0.113
Wed, 16 Jun 2021 15:07:24 GMT

_Version update only_

## 1.0.112
Tue, 15 Jun 2021 20:38:35 GMT

_Version update only_

## 1.0.111
Fri, 11 Jun 2021 23:26:16 GMT

_Version update only_

## 1.0.110
Fri, 11 Jun 2021 00:34:02 GMT

_Version update only_

## 1.0.109
Thu, 10 Jun 2021 15:08:16 GMT

_Version update only_

## 1.0.108
Fri, 04 Jun 2021 19:59:53 GMT

_Version update only_

## 1.0.107
Fri, 04 Jun 2021 15:08:20 GMT

_Version update only_

## 1.0.106
Fri, 04 Jun 2021 00:08:34 GMT

_Version update only_

## 1.0.105
Tue, 01 Jun 2021 18:29:26 GMT

_Version update only_

## 1.0.104
Sat, 29 May 2021 01:05:06 GMT

_Version update only_

## 1.0.103
Fri, 28 May 2021 06:19:58 GMT

_Version update only_

## 1.0.102
Tue, 25 May 2021 00:12:21 GMT

_Version update only_

## 1.0.101
Wed, 19 May 2021 00:11:39 GMT

_Version update only_

## 1.0.100
Thu, 13 May 2021 01:52:47 GMT

_Version update only_

## 1.0.99
Tue, 11 May 2021 22:19:17 GMT

_Version update only_

## 1.0.98
Mon, 03 May 2021 15:10:28 GMT

_Version update only_

## 1.0.97
Thu, 29 Apr 2021 23:26:50 GMT

_Version update only_

## 1.0.96
Thu, 29 Apr 2021 01:07:29 GMT

_Version update only_

## 1.0.95
Fri, 23 Apr 2021 22:00:07 GMT

_Version update only_

## 1.0.94
Fri, 23 Apr 2021 15:11:21 GMT

_Version update only_

## 1.0.93
Wed, 21 Apr 2021 15:12:28 GMT

_Version update only_

## 1.0.92
Tue, 20 Apr 2021 04:59:51 GMT

_Version update only_

## 1.0.91
Thu, 15 Apr 2021 02:59:25 GMT

_Version update only_

## 1.0.90
Mon, 12 Apr 2021 15:10:29 GMT

_Version update only_

## 1.0.89
Thu, 08 Apr 2021 20:41:55 GMT

_Version update only_

## 1.0.88
Thu, 08 Apr 2021 06:05:32 GMT

_Version update only_

## 1.0.87
Thu, 08 Apr 2021 00:10:18 GMT

_Version update only_

## 1.0.86
Tue, 06 Apr 2021 15:14:22 GMT

_Version update only_

## 1.0.85
Wed, 31 Mar 2021 15:10:36 GMT

_Version update only_

## 1.0.84
Mon, 29 Mar 2021 05:02:07 GMT

_Version update only_

## 1.0.83
Fri, 19 Mar 2021 22:31:38 GMT

_Version update only_

## 1.0.82
Wed, 17 Mar 2021 05:04:38 GMT

_Version update only_

## 1.0.81
Fri, 12 Mar 2021 01:13:27 GMT

_Version update only_

## 1.0.80
Wed, 10 Mar 2021 06:23:29 GMT

_Version update only_

## 1.0.79
Wed, 10 Mar 2021 05:10:06 GMT

_Version update only_

## 1.0.78
Thu, 04 Mar 2021 01:11:31 GMT

_Version update only_

## 1.0.77
Tue, 02 Mar 2021 23:25:05 GMT

_Version update only_

## 1.0.76
Wed, 10 Feb 2021 01:31:21 GMT

### Patches

- Fix an error "process.on() is not a function" caused by an incorrect import
- Fix a race condition that sometimes caused an error "Child process terminated without completing IPC handshake"

## 1.0.75
Fri, 05 Feb 2021 16:10:42 GMT

_Version update only_

## 1.0.74
Fri, 22 Jan 2021 05:39:22 GMT

_Version update only_

## 1.0.73
Thu, 21 Jan 2021 04:19:01 GMT

_Version update only_

## 1.0.72
Wed, 13 Jan 2021 01:11:06 GMT

_Version update only_

## 1.0.71
Fri, 08 Jan 2021 07:28:50 GMT

_Version update only_

## 1.0.70
Wed, 06 Jan 2021 16:10:43 GMT

_Version update only_

## 1.0.69
Mon, 14 Dec 2020 16:12:21 GMT

_Version update only_

## 1.0.68
Thu, 10 Dec 2020 23:25:50 GMT

_Version update only_

## 1.0.67
Sat, 05 Dec 2020 01:11:23 GMT

_Version update only_

## 1.0.66
Tue, 01 Dec 2020 01:10:38 GMT

_Version update only_

## 1.0.65
Mon, 30 Nov 2020 16:11:50 GMT

_Version update only_

## 1.0.64
Wed, 18 Nov 2020 08:19:54 GMT

_Version update only_

## 1.0.63
Wed, 18 Nov 2020 06:21:58 GMT

_Version update only_

## 1.0.62
Tue, 17 Nov 2020 01:17:38 GMT

_Version update only_

## 1.0.61
Mon, 16 Nov 2020 01:57:58 GMT

_Version update only_

## 1.0.60
Fri, 13 Nov 2020 01:11:01 GMT

_Version update only_

## 1.0.59
Thu, 12 Nov 2020 01:11:10 GMT

_Version update only_

## 1.0.58
Wed, 11 Nov 2020 01:08:58 GMT

_Version update only_

## 1.0.57
Tue, 10 Nov 2020 23:13:12 GMT

_Version update only_

## 1.0.56
Tue, 10 Nov 2020 16:11:42 GMT

_Version update only_

## 1.0.55
Sun, 08 Nov 2020 22:52:49 GMT

_Version update only_

## 1.0.54
Fri, 06 Nov 2020 16:09:30 GMT

_Version update only_

## 1.0.53
Tue, 03 Nov 2020 01:11:19 GMT

_Version update only_

## 1.0.52
Mon, 02 Nov 2020 16:12:05 GMT

_Version update only_

## 1.0.51
Fri, 30 Oct 2020 06:38:39 GMT

_Version update only_

## 1.0.50
Fri, 30 Oct 2020 00:10:14 GMT

_Version update only_

## 1.0.49
Thu, 29 Oct 2020 06:14:19 GMT

_Version update only_

## 1.0.48
Thu, 29 Oct 2020 00:11:33 GMT

_Version update only_

## 1.0.47
Wed, 28 Oct 2020 01:18:03 GMT

_Version update only_

## 1.0.46
Tue, 27 Oct 2020 15:10:14 GMT

_Version update only_

## 1.0.45
Sat, 24 Oct 2020 00:11:19 GMT

_Version update only_

## 1.0.44
Wed, 21 Oct 2020 05:09:44 GMT

_Version update only_

## 1.0.43
Wed, 21 Oct 2020 02:28:17 GMT

_Version update only_

## 1.0.42
Fri, 16 Oct 2020 23:32:58 GMT

_Version update only_

## 1.0.41
Thu, 15 Oct 2020 00:59:08 GMT

_Version update only_

## 1.0.40
Wed, 14 Oct 2020 23:30:14 GMT

_Version update only_

## 1.0.39
Tue, 13 Oct 2020 15:11:28 GMT

_Version update only_

## 1.0.38
Mon, 12 Oct 2020 15:11:16 GMT

_Version update only_

## 1.0.37
Fri, 09 Oct 2020 15:11:09 GMT

_Version update only_

## 1.0.36
Tue, 06 Oct 2020 00:24:06 GMT

_Version update only_

## 1.0.35
Mon, 05 Oct 2020 22:36:57 GMT

_Version update only_

## 1.0.34
Mon, 05 Oct 2020 15:10:43 GMT

_Version update only_

## 1.0.33
Fri, 02 Oct 2020 00:10:59 GMT

_Version update only_

## 1.0.32
Thu, 01 Oct 2020 20:27:16 GMT

_Version update only_

## 1.0.31
Thu, 01 Oct 2020 18:51:21 GMT

_Version update only_

## 1.0.30
Wed, 30 Sep 2020 18:39:17 GMT

_Version update only_

## 1.0.29
Wed, 30 Sep 2020 06:53:53 GMT

### Patches

- Include missing "License" field.
- Update README.md

## 1.0.28
Tue, 22 Sep 2020 05:45:57 GMT

_Version update only_

## 1.0.27
Tue, 22 Sep 2020 01:45:31 GMT

_Version update only_

## 1.0.26
Tue, 22 Sep 2020 00:08:53 GMT

_Version update only_

## 1.0.25
Sat, 19 Sep 2020 04:37:27 GMT

_Version update only_

## 1.0.24
Sat, 19 Sep 2020 03:33:07 GMT

_Version update only_

## 1.0.23
Fri, 18 Sep 2020 22:57:24 GMT

_Version update only_

## 1.0.22
Fri, 18 Sep 2020 21:49:53 GMT

_Version update only_

## 1.0.21
Wed, 16 Sep 2020 05:30:26 GMT

_Version update only_

## 1.0.20
Tue, 15 Sep 2020 01:51:37 GMT

_Version update only_

## 1.0.19
Mon, 14 Sep 2020 15:09:48 GMT

_Version update only_

## 1.0.18
Sun, 13 Sep 2020 01:53:20 GMT

_Version update only_

## 1.0.17
Fri, 11 Sep 2020 02:13:35 GMT

_Version update only_

## 1.0.16
Wed, 09 Sep 2020 03:29:01 GMT

_Version update only_

## 1.0.15
Wed, 09 Sep 2020 00:38:48 GMT

_Version update only_

## 1.0.14
Mon, 07 Sep 2020 07:37:37 GMT

_Version update only_

## 1.0.13
Sat, 05 Sep 2020 18:56:35 GMT

_Version update only_

## 1.0.12
Fri, 04 Sep 2020 15:06:28 GMT

_Version update only_

## 1.0.11
Thu, 03 Sep 2020 15:09:59 GMT

_Version update only_

## 1.0.10
Wed, 02 Sep 2020 23:01:13 GMT

_Version update only_

## 1.0.9
Wed, 02 Sep 2020 15:10:17 GMT

_Version update only_

## 1.0.8
Thu, 27 Aug 2020 11:27:06 GMT

_Version update only_

## 1.0.7
Tue, 25 Aug 2020 00:10:12 GMT

_Version update only_

## 1.0.6
Mon, 24 Aug 2020 07:35:21 GMT

_Version update only_

## 1.0.5
Sat, 22 Aug 2020 05:55:43 GMT

_Version update only_

## 1.0.4
Fri, 21 Aug 2020 01:21:18 GMT

_Version update only_

## 1.0.3
Thu, 20 Aug 2020 18:41:47 GMT

_Version update only_

## 1.0.2
Thu, 20 Aug 2020 15:13:53 GMT

_Version update only_

## 1.0.1
Thu, 20 Aug 2020 04:47:08 GMT

### Patches

- Fix incorrect behavior when the "--args" parameter was omitted

## 1.0.0
Thu, 20 Aug 2020 01:17:28 GMT

### Breaking changes

- Initial release

