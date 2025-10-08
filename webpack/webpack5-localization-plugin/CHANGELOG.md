# Change Log - @rushstack/webpack5-localization-plugin

This log was last generated on Wed, 08 Oct 2025 00:13:29 GMT and should not be manually modified.

## 0.15.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 0.15.0
Fri, 03 Oct 2025 20:10:00 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 0.14.7
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 0.14.6
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.14.5
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.14.4
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.14.3
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.14.2
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 0.14.1
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.14.0
Mon, 30 Jun 2025 22:04:32 GMT

### Minor changes

- Add a feature for injecting custom localized values into a compilation via the `getCustomDataPlaceholderForValueFunction` function on an instance of the `LocalizationPlugin`.

## 0.13.16
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.13.15
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.13.14
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.13.13
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.13.12
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.13.11
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.13.10
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 0.13.9
Tue, 15 Apr 2025 15:11:58 GMT

_Version update only_

## 0.13.8
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 0.13.7
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 0.13.6
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 0.13.5
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 0.13.4
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 0.13.3
Tue, 11 Mar 2025 02:12:34 GMT

_Version update only_

## 0.13.2
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.13.1
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.13.0
Thu, 27 Feb 2025 16:10:47 GMT

### Minor changes

- Support passing the `ignoreString` option to all loaders.

## 0.12.6
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.12.5
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 0.12.4
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.12.3
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.12.2
Fri, 14 Feb 2025 23:17:26 GMT

### Patches

- Fix a bug where `chunk.localizedFiles` was not set in incremental rebuilds.

## 0.12.1
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.12.0
Thu, 06 Feb 2025 01:11:16 GMT

### Minor changes

- Leverage webpack caching layer for localized and nonlocalized asset generation. Reduce unnecessary work.

## 0.11.26
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.11.25
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.11.24
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.11.23
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.11.22
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.11.21
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.11.20
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 0.11.19
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.11.18
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.11.17
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.11.16
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.11.15
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.11.14
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.11.13
Wed, 02 Oct 2024 00:11:19 GMT

### Patches

- Ensure compatibility with webpack 5.95.0

## 0.11.12
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.11.11
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.11.10
Sat, 28 Sep 2024 00:11:41 GMT

_Version update only_

## 0.11.9
Tue, 24 Sep 2024 00:11:19 GMT

### Patches

- Fix circular references between localized assets' "related" properties. This caused emitting of the webpack stats object to fail.

## 0.11.8
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.11.7
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.11.6
Mon, 26 Aug 2024 02:00:11 GMT

_Version update only_

## 0.11.5
Wed, 21 Aug 2024 16:24:51 GMT

_Version update only_

## 0.11.4
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.11.3
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.11.2
Wed, 07 Aug 2024 00:11:51 GMT

### Patches

- Improve performance of localized asset reconstruction.

## 0.11.1
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.11.0
Wed, 31 Jul 2024 00:10:53 GMT

### Minor changes

- Include webpack compilation in localizationStats callback.

## 0.10.21
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.10.20
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 0.10.19
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 0.10.18
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.10.17
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 0.10.16
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.10.15
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.10.14
Thu, 30 May 2024 00:13:05 GMT

### Patches

- Include missing `type` modifiers on type-only exports.

## 0.10.13
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 0.10.12
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.10.11
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.10.10
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.10.9
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.10.8
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 0.10.7
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.10.6
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.10.5
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.10.4
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.10.3
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.10.2
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 0.10.1
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 0.10.0
Tue, 16 Apr 2024 22:49:20 GMT

### Minor changes

- Perform localization before devtool runs instead of after. This is more expensive but ensures source maps are correct.

## 0.9.15
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.9.14
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 0.9.13
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 0.9.12
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 0.9.11
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 0.9.10
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 0.9.9
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 0.9.8
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 0.9.7
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 0.9.6
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.9.5
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 0.9.4
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.9.3
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 0.9.2
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.9.1
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 0.9.0
Mon, 19 Feb 2024 21:54:27 GMT

### Minor changes

- Filter out non-JS chunks.

## 0.8.1
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 0.8.0
Sat, 10 Feb 2024 01:40:49 GMT

### Minor changes

- Export a `TrueHashPlugin` that performs what the `realContentHash` option does, but without validating the localization plugin's options.

## 0.7.3
Sat, 10 Feb 2024 01:29:22 GMT

### Patches

- Add support for the `output.hashSalt` option when the `realContentHashes` feature is enabled.

## 0.7.2
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 0.7.1
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 0.7.0
Mon, 05 Feb 2024 23:46:52 GMT

### Minor changes

- Include an option called `realContentHash` that updates "[contenthash]" hashes to the actual hashes of chunks.
- Add a warning if `optimization.realContentHash` is set.

## 0.6.4
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.6.3
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 0.6.2
Tue, 23 Jan 2024 16:15:06 GMT

_Version update only_

## 0.6.1
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 0.6.0
Thu, 04 Jan 2024 01:08:53 GMT

### Minor changes

- Introduce a `formatLocaleForFilename` option to customize how a locale (or the lack thereof) is rendered in file paths.

## 0.5.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 0.5.15
Wed, 20 Dec 2023 01:09:46 GMT

_Version update only_

## 0.5.14
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 0.5.13
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 0.5.12
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 0.5.11
Wed, 01 Nov 2023 23:11:36 GMT

### Patches

- Fix line endings in published package.

## 0.5.10
Mon, 30 Oct 2023 23:36:38 GMT

_Version update only_

## 0.5.9
Sun, 01 Oct 2023 02:56:30 GMT

_Version update only_

## 0.5.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 0.5.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 0.5.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 0.5.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 0.5.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.5.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 0.5.2
Fri, 22 Sep 2023 00:05:51 GMT

_Version update only_

## 0.5.1
Tue, 19 Sep 2023 15:21:52 GMT

_Version update only_

## 0.5.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 0.4.41
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.4.40
Sat, 05 Aug 2023 00:20:19 GMT

_Version update only_

## 0.4.39
Fri, 04 Aug 2023 00:22:37 GMT

_Version update only_

## 0.4.38
Mon, 31 Jul 2023 15:19:06 GMT

_Version update only_

## 0.4.37
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.4.36
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 0.4.35
Wed, 19 Jul 2023 00:20:32 GMT

_Version update only_

## 0.4.34
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 0.4.33
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.4.32
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 0.4.31
Wed, 12 Jul 2023 00:23:30 GMT

_Version update only_

## 0.4.30
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 0.4.29
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.4.28
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 0.4.27
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.4.26
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.4.25
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.4.24
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.4.23
Tue, 13 Jun 2023 01:49:01 GMT

### Patches

- Bump webpack to v5.82.1

## 0.4.22
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.4.21
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 0.4.20
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 0.4.19
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.4.18
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 0.4.17
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 0.4.16
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 0.4.15
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 0.4.14
Fri, 02 Jun 2023 02:01:13 GMT

_Version update only_

## 0.4.13
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.4.12
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 0.4.11
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 0.4.10
Thu, 04 May 2023 00:20:29 GMT

_Version update only_

## 0.4.9
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 0.4.8
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 0.4.7
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 0.4.6
Thu, 20 Apr 2023 15:16:55 GMT

### Patches

- Update webpack to v5.80.0

## 0.4.5
Fri, 07 Apr 2023 22:19:21 GMT

### Patches

- Bump webpack to 5.78.0

## 0.4.4
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 0.4.3
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 0.4.2
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 0.4.1
Sun, 05 Feb 2023 03:02:02 GMT

### Patches

- Change the peer dependency selector on `@types/node` to a wildcard (`*`).

## 0.4.0
Wed, 01 Feb 2023 02:16:34 GMT

### Minor changes

- Bump @types/node peerDependency to ^14.18.36.

## 0.3.0
Mon, 30 Jan 2023 16:22:30 GMT

### Minor changes

- Move the @types/node dependency to an optional peerDependency.

## 0.2.4
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 0.2.3
Thu, 26 Jan 2023 02:55:10 GMT

### Patches

- Upgrade to webpack 5.75.0

## 0.2.2
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 0.2.1
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 0.2.0
Tue, 20 Dec 2022 21:56:32 GMT

### Minor changes

- Convert LocalizationPlugin._stringKeys to public stringKeys property.

## 0.1.40
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 0.1.39
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 0.1.38
Thu, 01 Dec 2022 03:22:36 GMT

_Version update only_

## 0.1.37
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 0.1.36
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 0.1.35
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 0.1.34
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 0.1.33
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 0.1.32
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 0.1.31
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 0.1.30
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 0.1.29
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 0.1.28
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 0.1.27
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 0.1.26
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 0.1.25
Thu, 15 Sep 2022 00:18:52 GMT

_Version update only_

## 0.1.24
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 0.1.23
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 0.1.22
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 0.1.21
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 0.1.20
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 0.1.19
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 0.1.18
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 0.1.17
Fri, 19 Aug 2022 00:17:20 GMT

_Version update only_

## 0.1.16
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 0.1.15
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 0.1.14
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 0.1.13
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 0.1.12
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 0.1.11
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 0.1.10
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 0.1.9
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 0.1.8
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 0.1.7
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 0.1.6
Tue, 28 Jun 2022 22:47:13 GMT

### Patches

- Ensure localization file path resolution can handle a UNIX file system on a Windows host, as is used by the unit tests.

## 0.1.5
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 0.1.4
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 0.1.3
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 0.1.2
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 0.1.1
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 0.1.0
Thu, 23 Jun 2022 22:14:24 GMT

### Minor changes

- Initial publish of webpack 5 compatible localization plugin.

