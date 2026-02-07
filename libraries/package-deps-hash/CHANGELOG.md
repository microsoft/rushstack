# Change Log - @rushstack/package-deps-hash

This log was last generated on Sat, 07 Feb 2026 01:13:26 GMT and should not be manually modified.

## 4.6.8
Sat, 07 Feb 2026 01:13:26 GMT

_Version update only_

## 4.6.7
Wed, 04 Feb 2026 20:42:47 GMT

_Version update only_

## 4.6.6
Wed, 04 Feb 2026 16:13:27 GMT

_Version update only_

## 4.6.5
Fri, 30 Jan 2026 01:16:13 GMT

_Version update only_

## 4.6.4
Thu, 08 Jan 2026 01:12:30 GMT

_Version update only_

## 4.6.3
Wed, 07 Jan 2026 01:12:25 GMT

_Version update only_

## 4.6.2
Mon, 05 Jan 2026 16:12:50 GMT

_Version update only_

## 4.6.1
Mon, 29 Dec 2025 22:42:58 GMT

### Patches

- Update MINIMUM_GIT_VERSION to 2.35.0 to account for usage of the --format argument with git ls-files

## 4.6.0
Fri, 12 Dec 2025 01:12:05 GMT

### Minor changes

- Replace "git ls-tree" with "git ls-files" to improve performance. Identify symbolic links and return them separately in "getDetailedRepoStateAsync". Symbolic links will be omitted from the result returned by "getRepoStateAsync", as they are not "files".

## 4.5.7
Sat, 06 Dec 2025 01:12:28 GMT

_Version update only_

## 4.5.6
Fri, 21 Nov 2025 16:13:56 GMT

_Version update only_

## 4.5.5
Wed, 12 Nov 2025 01:12:56 GMT

_Version update only_

## 4.5.4
Tue, 04 Nov 2025 08:15:15 GMT

_Version update only_

## 4.5.3
Fri, 24 Oct 2025 00:13:38 GMT

_Version update only_

## 4.5.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 4.5.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 4.5.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 4.4.9
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 4.4.8
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 4.4.7
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 4.4.6
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 4.4.5
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 4.4.4
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 4.4.3
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 4.4.2
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 4.4.1
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 4.4.0
Thu, 08 May 2025 00:11:15 GMT

### Minor changes

- Add `getDetailedRepoState` API to expose `hasSubmodules` and `hasUncommittedChanges` in addition to the results returned by `getRepoState`.

## 4.3.24
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 4.3.23
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 4.3.22
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 4.3.21
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 4.3.20
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 4.3.19
Tue, 15 Apr 2025 15:11:58 GMT

_Version update only_

## 4.3.18
Wed, 09 Apr 2025 00:11:03 GMT

_Version update only_

## 4.3.17
Fri, 04 Apr 2025 18:34:35 GMT

_Version update only_

## 4.3.16
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 4.3.15
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 4.3.14
Wed, 12 Mar 2025 00:11:32 GMT

_Version update only_

## 4.3.13
Tue, 11 Mar 2025 02:12:34 GMT

_Version update only_

## 4.3.12
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 4.3.11
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 4.3.10
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 4.3.9
Wed, 26 Feb 2025 16:11:12 GMT

_Version update only_

## 4.3.8
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 4.3.7
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 4.3.6
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 4.3.5
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 4.3.4
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 4.3.3
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 4.3.2
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 4.3.1
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 4.3.0
Thu, 12 Dec 2024 01:37:09 GMT

### Minor changes

- Add a new optional parameter `filterPath` to `getRepoStateAsync` that limits the scope of the git query to only the specified subpaths. This can significantly improve the performance of the function when only part of the full repo data is necessary.

## 4.2.11
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 4.2.10
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 4.2.9
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 4.2.8
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 4.2.7
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 4.2.6
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 4.2.5
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 4.2.4
Tue, 15 Oct 2024 00:12:32 GMT

_Version update only_

## 4.2.3
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 4.2.2
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 4.2.1
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 4.2.0
Sat, 21 Sep 2024 00:10:27 GMT

### Minor changes

- Expose `hashFilesAsync` API. This serves a similar role as `getGitHashForFiles` but is asynchronous and allows for the file names to be provided as an async iterable.

## 4.1.68
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 4.1.67
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 4.1.66
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 4.1.65
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 4.1.64
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 4.1.63
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 4.1.62
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 4.1.61
Wed, 17 Jul 2024 06:55:10 GMT

_Version update only_

## 4.1.60
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 4.1.59
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 4.1.58
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 4.1.57
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 4.1.56
Thu, 30 May 2024 00:13:05 GMT

### Patches

- Include missing `type` modifiers on type-only exports.

## 4.1.55
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 4.1.54
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 4.1.53
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 4.1.52
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 4.1.51
Sat, 25 May 2024 04:54:08 GMT

_Version update only_

## 4.1.50
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 4.1.49
Thu, 23 May 2024 02:26:56 GMT

### Patches

- Add a newline to an error message

## 4.1.48
Fri, 17 May 2024 00:10:40 GMT

### Patches

- Fix an issue where an incomplete repo state analysis was sometimes returned, especially on WSL. See https://github.com/microsoft/rushstack/pull/4711 for details.

## 4.1.47
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 4.1.46
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 4.1.45
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 4.1.44
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 4.1.43
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 4.1.42
Mon, 06 May 2024 15:11:05 GMT

_Version update only_

## 4.1.41
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 4.1.40
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 4.1.39
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 4.1.38
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 4.1.37
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 4.1.36
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 4.1.35
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 4.1.34
Thu, 29 Feb 2024 07:11:46 GMT

_Version update only_

## 4.1.33
Wed, 28 Feb 2024 16:09:28 GMT

_Version update only_

## 4.1.32
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 4.1.31
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 4.1.30
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 4.1.29
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 4.1.28
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 4.1.27
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 4.1.26
Mon, 19 Feb 2024 21:54:27 GMT

### Patches

- Fix a formatting issue with the LICENSE.

## 4.1.25
Sat, 17 Feb 2024 06:24:35 GMT

### Patches

- Fix broken link to API documentation

## 4.1.24
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 4.1.23
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 4.1.22
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 4.1.21
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 4.1.20
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 4.1.19
Tue, 23 Jan 2024 16:15:06 GMT

_Version update only_

## 4.1.18
Thu, 18 Jan 2024 01:08:53 GMT

### Patches

- Handle an edge case in `getRepoState` wherein it tries to asynchronously pipe data to `git hash-object` but the subprocess has already exited.

## 4.1.17
Tue, 16 Jan 2024 18:30:11 GMT

_Version update only_

## 4.1.16
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 4.1.15
Wed, 20 Dec 2023 01:09:46 GMT

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
Mon, 30 Oct 2023 23:36:38 GMT

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
Wed, 27 Sep 2023 00:21:39 GMT

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

## 4.0.44
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 4.0.43
Mon, 31 Jul 2023 15:19:06 GMT

_Version update only_

## 4.0.42
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 4.0.41
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 4.0.40
Wed, 19 Jul 2023 00:20:32 GMT

_Version update only_

## 4.0.39
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 4.0.38
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 4.0.37
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 4.0.36
Wed, 12 Jul 2023 00:23:30 GMT

_Version update only_

## 4.0.35
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 4.0.34
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 4.0.33
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 4.0.32
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 4.0.31
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 4.0.30
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 4.0.29
Tue, 13 Jun 2023 15:17:21 GMT

_Version update only_

## 4.0.28
Tue, 13 Jun 2023 01:49:02 GMT

_Version update only_

## 4.0.27
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 4.0.26
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 4.0.25
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 4.0.24
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 4.0.23
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 4.0.22
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 4.0.21
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 4.0.20
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 4.0.19
Fri, 02 Jun 2023 02:01:12 GMT

_Version update only_

## 4.0.18
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 4.0.17
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 4.0.16
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 4.0.15
Thu, 04 May 2023 00:20:29 GMT

_Version update only_

## 4.0.14
Mon, 01 May 2023 15:23:20 GMT

_Version update only_

## 4.0.13
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 4.0.12
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 4.0.11
Tue, 04 Apr 2023 22:36:28 GMT

_Version update only_

## 4.0.10
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 4.0.9
Fri, 24 Feb 2023 01:24:17 GMT

### Patches

- Prevent network calls or maintenance tasks during local Git operations.

## 4.0.8
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 4.0.7
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 4.0.6
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 4.0.5
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 4.0.4
Mon, 30 Jan 2023 00:55:44 GMT

_Version update only_

## 4.0.3
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 4.0.2
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 4.0.1
Tue, 24 Jan 2023 00:16:54 GMT

### Patches

- Fix bug in parseGitHashObject when 0 hashes are expected.

## 4.0.0
Fri, 20 Jan 2023 16:19:50 GMT

### Breaking changes

- Add getRepoStateAsync API for faster repository state calculation. Remove synchronous getRepoState API.

## 3.2.67
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 3.2.66
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 3.2.65
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 3.2.64
Tue, 29 Nov 2022 01:16:49 GMT

_Version update only_

## 3.2.63
Fri, 18 Nov 2022 04:02:22 GMT

### Patches

- Refactor the logic of getting file hashes under git submodule paths

## 3.2.62
Tue, 15 Nov 2022 18:43:30 GMT

### Patches

- Get file hashes under git submodule paths when analyzing repo state

## 3.2.61
Tue, 08 Nov 2022 01:20:56 GMT

_Version update only_

## 3.2.60
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 3.2.59
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 3.2.58
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 3.2.57
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 3.2.56
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 3.2.55
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 3.2.54
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 3.2.53
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 3.2.52
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 3.2.51
Fri, 23 Sep 2022 02:54:22 GMT

### Patches

- Fix getRepoState when the current working directory is not in the Git repository.

## 3.2.50
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 3.2.49
Thu, 15 Sep 2022 00:18:52 GMT

_Version update only_

## 3.2.48
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 3.2.47
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 3.2.46
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 3.2.45
Wed, 31 Aug 2022 01:45:06 GMT

_Version update only_

## 3.2.44
Wed, 31 Aug 2022 00:42:46 GMT

_Version update only_

## 3.2.43
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 3.2.42
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 3.2.41
Fri, 19 Aug 2022 00:17:20 GMT

_Version update only_

## 3.2.40
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 3.2.39
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 3.2.38
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 3.2.37
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 3.2.36
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 3.2.35
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 3.2.34
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 3.2.33
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 3.2.32
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 3.2.31
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 3.2.30
Tue, 28 Jun 2022 22:47:14 GMT

_Version update only_

## 3.2.29
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 3.2.28
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 3.2.27
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 3.2.26
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 3.2.25
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 3.2.24
Thu, 23 Jun 2022 22:14:25 GMT

_Version update only_

## 3.2.23
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 3.2.22
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 3.2.21
Tue, 07 Jun 2022 09:37:05 GMT

_Version update only_

## 3.2.20
Wed, 25 May 2022 22:25:08 GMT

_Version update only_

## 3.2.19
Thu, 19 May 2022 15:13:21 GMT

_Version update only_

## 3.2.18
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 3.2.17
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 3.2.16
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 3.2.15
Tue, 26 Apr 2022 00:10:15 GMT

_Version update only_

## 3.2.14
Sat, 23 Apr 2022 02:13:07 GMT

_Version update only_

## 3.2.13
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 3.2.12
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 3.2.11
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 3.2.10
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 3.2.9
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 3.2.8
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 3.2.7
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 3.2.6
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 3.2.5
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 3.2.4
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 3.2.3
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 3.2.2
Fri, 11 Feb 2022 10:30:26 GMT

_Version update only_

## 3.2.1
Tue, 25 Jan 2022 01:11:07 GMT

_Version update only_

## 3.2.0
Fri, 21 Jan 2022 01:10:41 GMT

### Minor changes

- Remove `--merge-base` from `getRepoChanges` and document the need to manually acquire merge-base commit if comparing against a separate branch.
- Reduce minimum Git version to 2.20.

### Patches

- Fix incorrect parsing in `parseGitStatus`.

## 3.1.13
Thu, 20 Jan 2022 02:43:46 GMT

_Version update only_

## 3.1.12
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 3.1.11
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 3.1.10
Thu, 16 Dec 2021 05:38:20 GMT

### Patches

- Provide a more useful error message if the git version is too old.

## 3.1.9
Tue, 14 Dec 2021 19:27:51 GMT

_Version update only_

## 3.1.8
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 3.1.7
Thu, 09 Dec 2021 00:21:54 GMT

### Patches

- When detecting changes relative to a target branch, use the merge base between the target branch and the current commit as the comparison ref.

## 3.1.6
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 3.1.5
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 3.1.4
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 3.1.3
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 3.1.2
Tue, 30 Nov 2021 20:18:41 GMT

_Version update only_

## 3.1.1
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 3.1.0
Sat, 06 Nov 2021 00:09:13 GMT

### Minor changes

- Added repo-level state extraction and change listing functions to support having rush.json in a subfolder of the repository.

## 3.0.86
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 3.0.85
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 3.0.84
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 3.0.83
Wed, 13 Oct 2021 15:09:55 GMT

_Version update only_

## 3.0.82
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 3.0.81
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 3.0.80
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 3.0.79
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 3.0.78
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 3.0.77
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 3.0.76
Tue, 05 Oct 2021 15:08:38 GMT

_Version update only_

## 3.0.75
Mon, 04 Oct 2021 15:10:18 GMT

_Version update only_

## 3.0.74
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 3.0.73
Thu, 23 Sep 2021 00:10:41 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 3.0.72
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 3.0.71
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 3.0.70
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 3.0.69
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 3.0.68
Mon, 13 Sep 2021 15:07:05 GMT

_Version update only_

## 3.0.67
Fri, 10 Sep 2021 15:08:28 GMT

_Version update only_

## 3.0.66
Wed, 08 Sep 2021 19:06:22 GMT

_Version update only_

## 3.0.65
Wed, 08 Sep 2021 00:08:03 GMT

_Version update only_

## 3.0.64
Fri, 03 Sep 2021 00:09:10 GMT

_Version update only_

## 3.0.63
Tue, 31 Aug 2021 00:07:11 GMT

_Version update only_

## 3.0.62
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 3.0.61
Fri, 20 Aug 2021 15:08:10 GMT

_Version update only_

## 3.0.60
Fri, 13 Aug 2021 00:09:14 GMT

_Version update only_

## 3.0.59
Thu, 12 Aug 2021 18:11:18 GMT

_Version update only_

## 3.0.58
Thu, 12 Aug 2021 01:28:38 GMT

_Version update only_

## 3.0.57
Wed, 11 Aug 2021 23:14:17 GMT

_Version update only_

## 3.0.56
Wed, 11 Aug 2021 00:07:21 GMT

_Version update only_

## 3.0.55
Sat, 31 Jul 2021 00:52:11 GMT

_Version update only_

## 3.0.54
Wed, 14 Jul 2021 15:06:29 GMT

_Version update only_

## 3.0.53
Tue, 13 Jul 2021 23:00:33 GMT

_Version update only_

## 3.0.52
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 3.0.51
Thu, 08 Jul 2021 23:41:17 GMT

_Version update only_

## 3.0.50
Thu, 08 Jul 2021 06:00:48 GMT

_Version update only_

## 3.0.49
Thu, 01 Jul 2021 15:08:27 GMT

_Version update only_

## 3.0.48
Wed, 30 Jun 2021 19:16:19 GMT

_Version update only_

## 3.0.47
Wed, 30 Jun 2021 15:06:54 GMT

_Version update only_

## 3.0.46
Wed, 30 Jun 2021 01:37:17 GMT

_Version update only_

## 3.0.45
Fri, 25 Jun 2021 00:08:28 GMT

_Version update only_

## 3.0.44
Fri, 18 Jun 2021 06:23:05 GMT

_Version update only_

## 3.0.43
Wed, 16 Jun 2021 18:53:52 GMT

_Version update only_

## 3.0.42
Wed, 16 Jun 2021 15:07:24 GMT

_Version update only_

## 3.0.41
Tue, 15 Jun 2021 20:38:35 GMT

_Version update only_

## 3.0.40
Fri, 11 Jun 2021 23:26:16 GMT

_Version update only_

## 3.0.39
Fri, 11 Jun 2021 00:34:02 GMT

_Version update only_

## 3.0.38
Thu, 10 Jun 2021 15:08:16 GMT

_Version update only_

## 3.0.37
Fri, 04 Jun 2021 19:59:53 GMT

_Version update only_

## 3.0.36
Fri, 04 Jun 2021 15:08:20 GMT

_Version update only_

## 3.0.35
Fri, 04 Jun 2021 00:08:34 GMT

_Version update only_

## 3.0.34
Tue, 01 Jun 2021 18:29:26 GMT

_Version update only_

## 3.0.33
Sat, 29 May 2021 01:05:06 GMT

_Version update only_

## 3.0.32
Fri, 28 May 2021 06:19:58 GMT

_Version update only_

## 3.0.31
Tue, 25 May 2021 00:12:21 GMT

_Version update only_

## 3.0.30
Wed, 19 May 2021 00:11:39 GMT

_Version update only_

## 3.0.29
Thu, 13 May 2021 01:52:47 GMT

_Version update only_

## 3.0.28
Tue, 11 May 2021 22:19:17 GMT

_Version update only_

## 3.0.27
Mon, 03 May 2021 15:10:28 GMT

_Version update only_

## 3.0.26
Thu, 29 Apr 2021 23:26:50 GMT

_Version update only_

## 3.0.25
Thu, 29 Apr 2021 01:07:29 GMT

_Version update only_

## 3.0.24
Fri, 23 Apr 2021 22:00:07 GMT

_Version update only_

## 3.0.23
Fri, 23 Apr 2021 15:11:21 GMT

_Version update only_

## 3.0.22
Wed, 21 Apr 2021 15:12:28 GMT

_Version update only_

## 3.0.21
Tue, 20 Apr 2021 04:59:51 GMT

_Version update only_

## 3.0.20
Thu, 15 Apr 2021 02:59:25 GMT

_Version update only_

## 3.0.19
Mon, 12 Apr 2021 15:10:29 GMT

_Version update only_

## 3.0.18
Thu, 08 Apr 2021 20:41:55 GMT

_Version update only_

## 3.0.17
Thu, 08 Apr 2021 06:05:32 GMT

_Version update only_

## 3.0.16
Thu, 08 Apr 2021 00:10:18 GMT

_Version update only_

## 3.0.15
Tue, 06 Apr 2021 15:14:22 GMT

_Version update only_

## 3.0.14
Wed, 31 Mar 2021 15:10:36 GMT

_Version update only_

## 3.0.13
Mon, 29 Mar 2021 05:02:07 GMT

_Version update only_

## 3.0.12
Fri, 19 Mar 2021 22:31:38 GMT

_Version update only_

## 3.0.11
Wed, 17 Mar 2021 05:04:38 GMT

_Version update only_

## 3.0.10
Fri, 12 Mar 2021 01:13:27 GMT

_Version update only_

## 3.0.9
Wed, 10 Mar 2021 06:23:29 GMT

_Version update only_

## 3.0.8
Wed, 10 Mar 2021 05:10:06 GMT

_Version update only_

## 3.0.7
Thu, 04 Mar 2021 01:11:31 GMT

_Version update only_

## 3.0.6
Tue, 02 Mar 2021 23:25:05 GMT

_Version update only_

## 3.0.5
Fri, 05 Feb 2021 16:10:42 GMT

_Version update only_

## 3.0.4
Fri, 22 Jan 2021 05:39:22 GMT

_Version update only_

## 3.0.3
Thu, 21 Jan 2021 04:19:01 GMT

_Version update only_

## 3.0.2
Wed, 13 Jan 2021 01:11:06 GMT

_Version update only_

## 3.0.1
Fri, 08 Jan 2021 07:28:50 GMT

_Version update only_

## 3.0.0
Fri, 08 Jan 2021 05:24:33 GMT

### Breaking changes

- Refactor getPackageDeps to return a map.

### Minor changes

- Allow the git binary path to be explicitly provided.

## 2.4.110
Wed, 06 Jan 2021 16:10:43 GMT

_Version update only_

## 2.4.109
Mon, 14 Dec 2020 16:12:21 GMT

_Version update only_

## 2.4.108
Thu, 10 Dec 2020 23:25:50 GMT

_Version update only_

## 2.4.107
Sat, 05 Dec 2020 01:11:23 GMT

_Version update only_

## 2.4.106
Tue, 01 Dec 2020 01:10:38 GMT

_Version update only_

## 2.4.105
Mon, 30 Nov 2020 16:11:50 GMT

_Version update only_

## 2.4.104
Wed, 18 Nov 2020 08:19:54 GMT

_Version update only_

## 2.4.103
Wed, 18 Nov 2020 06:21:58 GMT

_Version update only_

## 2.4.102
Tue, 17 Nov 2020 01:17:38 GMT

_Version update only_

## 2.4.101
Mon, 16 Nov 2020 01:57:58 GMT

_Version update only_

## 2.4.100
Fri, 13 Nov 2020 01:11:01 GMT

_Version update only_

## 2.4.99
Thu, 12 Nov 2020 01:11:10 GMT

_Version update only_

## 2.4.98
Wed, 11 Nov 2020 01:08:58 GMT

_Version update only_

## 2.4.97
Tue, 10 Nov 2020 23:13:12 GMT

_Version update only_

## 2.4.96
Tue, 10 Nov 2020 16:11:42 GMT

_Version update only_

## 2.4.95
Sun, 08 Nov 2020 22:52:49 GMT

_Version update only_

## 2.4.94
Fri, 06 Nov 2020 16:09:30 GMT

_Version update only_

## 2.4.93
Tue, 03 Nov 2020 01:11:19 GMT

_Version update only_

## 2.4.92
Mon, 02 Nov 2020 16:12:05 GMT

_Version update only_

## 2.4.91
Fri, 30 Oct 2020 06:38:39 GMT

_Version update only_

## 2.4.90
Fri, 30 Oct 2020 00:10:14 GMT

_Version update only_

## 2.4.89
Thu, 29 Oct 2020 06:14:19 GMT

_Version update only_

## 2.4.88
Thu, 29 Oct 2020 00:11:33 GMT

_Version update only_

## 2.4.87
Wed, 28 Oct 2020 01:18:03 GMT

_Version update only_

## 2.4.86
Tue, 27 Oct 2020 15:10:14 GMT

_Version update only_

## 2.4.85
Sat, 24 Oct 2020 00:11:19 GMT

_Version update only_

## 2.4.84
Wed, 21 Oct 2020 05:09:44 GMT

_Version update only_

## 2.4.83
Wed, 21 Oct 2020 02:28:17 GMT

_Version update only_

## 2.4.82
Fri, 16 Oct 2020 23:32:58 GMT

_Version update only_

## 2.4.81
Thu, 15 Oct 2020 00:59:08 GMT

_Version update only_

## 2.4.80
Wed, 14 Oct 2020 23:30:14 GMT

_Version update only_

## 2.4.79
Tue, 13 Oct 2020 15:11:28 GMT

_Version update only_

## 2.4.78
Mon, 12 Oct 2020 15:11:16 GMT

_Version update only_

## 2.4.77
Fri, 09 Oct 2020 15:11:09 GMT

_Version update only_

## 2.4.76
Tue, 06 Oct 2020 00:24:06 GMT

_Version update only_

## 2.4.75
Mon, 05 Oct 2020 22:36:57 GMT

_Version update only_

## 2.4.74
Mon, 05 Oct 2020 15:10:43 GMT

_Version update only_

## 2.4.73
Fri, 02 Oct 2020 00:10:59 GMT

_Version update only_

## 2.4.72
Thu, 01 Oct 2020 20:27:16 GMT

_Version update only_

## 2.4.71
Thu, 01 Oct 2020 18:51:21 GMT

_Version update only_

## 2.4.70
Wed, 30 Sep 2020 18:39:17 GMT

### Patches

- Update to build with @rushstack/heft-node-rig

## 2.4.69
Wed, 30 Sep 2020 06:53:53 GMT

### Patches

- Update README.md

## 2.4.68
Tue, 22 Sep 2020 05:45:57 GMT

_Version update only_

## 2.4.67
Tue, 22 Sep 2020 01:45:31 GMT

_Version update only_

## 2.4.66
Tue, 22 Sep 2020 00:08:53 GMT

_Version update only_

## 2.4.65
Sat, 19 Sep 2020 04:37:27 GMT

_Version update only_

## 2.4.64
Sat, 19 Sep 2020 03:33:07 GMT

_Version update only_

## 2.4.63
Fri, 18 Sep 2020 22:57:24 GMT

_Version update only_

## 2.4.62
Fri, 18 Sep 2020 21:49:53 GMT

_Version update only_

## 2.4.61
Wed, 16 Sep 2020 05:30:26 GMT

_Version update only_

## 2.4.60
Tue, 15 Sep 2020 01:51:37 GMT

_Version update only_

## 2.4.59
Mon, 14 Sep 2020 15:09:48 GMT

_Version update only_

## 2.4.58
Sun, 13 Sep 2020 01:53:20 GMT

_Version update only_

## 2.4.57
Fri, 11 Sep 2020 02:13:35 GMT

_Version update only_

## 2.4.56
Wed, 09 Sep 2020 03:29:01 GMT

_Version update only_

## 2.4.55
Wed, 09 Sep 2020 00:38:48 GMT

_Version update only_

## 2.4.54
Mon, 07 Sep 2020 07:37:37 GMT

_Version update only_

## 2.4.53
Sat, 05 Sep 2020 18:56:35 GMT

_Version update only_

## 2.4.52
Fri, 04 Sep 2020 15:06:28 GMT

_Version update only_

## 2.4.51
Thu, 03 Sep 2020 15:09:59 GMT

_Version update only_

## 2.4.50
Wed, 02 Sep 2020 23:01:13 GMT

_Version update only_

## 2.4.49
Wed, 02 Sep 2020 15:10:17 GMT

_Version update only_

## 2.4.48
Thu, 27 Aug 2020 11:27:06 GMT

_Version update only_

## 2.4.47
Tue, 25 Aug 2020 00:10:12 GMT

### Patches

- Do not attempt to hash files that are deleted in the working tree.

## 2.4.46
Mon, 24 Aug 2020 07:35:21 GMT

_Version update only_

## 2.4.45
Sat, 22 Aug 2020 05:55:43 GMT

_Version update only_

## 2.4.44
Fri, 21 Aug 2020 01:21:18 GMT

_Version update only_

## 2.4.43
Thu, 20 Aug 2020 18:41:47 GMT

_Version update only_

## 2.4.42
Thu, 20 Aug 2020 15:13:52 GMT

_Version update only_

## 2.4.41
Tue, 18 Aug 2020 23:59:42 GMT

_Version update only_

## 2.4.40
Tue, 18 Aug 2020 03:03:24 GMT

_Version update only_

## 2.4.39
Mon, 17 Aug 2020 05:31:53 GMT

_Version update only_

## 2.4.38
Mon, 17 Aug 2020 04:53:23 GMT

_Version update only_

## 2.4.37
Thu, 13 Aug 2020 09:26:40 GMT

_Version update only_

## 2.4.36
Thu, 13 Aug 2020 04:57:38 GMT

_Version update only_

## 2.4.35
Wed, 12 Aug 2020 00:10:05 GMT

### Patches

- Updated project to build with Heft

## 2.4.34
Wed, 05 Aug 2020 18:27:32 GMT

_Version update only_

## 2.4.33
Mon, 20 Jul 2020 06:52:33 GMT

### Patches

- Fix hashing when a filename contains a space, a special character (ex. ", \), or a unicode character, and fix git hash-object call when long filenames are provided

## 2.4.32
Fri, 03 Jul 2020 15:09:04 GMT

_Version update only_

## 2.4.31
Fri, 03 Jul 2020 05:46:42 GMT

_Version update only_

## 2.4.30
Sat, 27 Jun 2020 00:09:38 GMT

_Version update only_

## 2.4.29
Fri, 26 Jun 2020 22:16:39 GMT

_Version update only_

## 2.4.28
Thu, 25 Jun 2020 06:43:35 GMT

_Version update only_

## 2.4.27
Wed, 24 Jun 2020 09:50:48 GMT

_Version update only_

## 2.4.26
Wed, 24 Jun 2020 09:04:28 GMT

_Version update only_

## 2.4.25
Mon, 15 Jun 2020 22:17:18 GMT

_Version update only_

## 2.4.24
Fri, 12 Jun 2020 09:19:21 GMT

_Version update only_

## 2.4.23
Wed, 10 Jun 2020 20:48:30 GMT

_Version update only_

## 2.4.22
Mon, 01 Jun 2020 08:34:17 GMT

_Version update only_

## 2.4.21
Sat, 30 May 2020 02:59:54 GMT

_Version update only_

## 2.4.20
Thu, 28 May 2020 05:59:02 GMT

_Version update only_

## 2.4.19
Wed, 27 May 2020 05:15:11 GMT

_Version update only_

## 2.4.18
Tue, 26 May 2020 23:00:25 GMT

_Version update only_

## 2.4.17
Fri, 22 May 2020 15:08:42 GMT

_Version update only_

## 2.4.16
Thu, 21 May 2020 23:09:44 GMT

_Version update only_

## 2.4.15
Thu, 21 May 2020 15:42:00 GMT

_Version update only_

## 2.4.14
Tue, 19 May 2020 15:08:20 GMT

_Version update only_

## 2.4.13
Fri, 15 May 2020 08:10:59 GMT

_Version update only_

## 2.4.12
Wed, 06 May 2020 08:23:45 GMT

_Version update only_

## 2.4.11
Sat, 02 May 2020 00:08:16 GMT

_Version update only_

## 2.4.10
Wed, 08 Apr 2020 04:07:33 GMT

_Version update only_

## 2.4.9
Fri, 03 Apr 2020 15:10:15 GMT

_Version update only_

## 2.4.8
Sun, 29 Mar 2020 00:04:12 GMT

_Version update only_

## 2.4.7
Sat, 28 Mar 2020 00:37:16 GMT

_Version update only_

## 2.4.6
Wed, 18 Mar 2020 15:07:47 GMT

_Version update only_

## 2.4.5
Tue, 17 Mar 2020 23:55:58 GMT

### Patches

- PACKAGE NAME CHANGE: The NPM scope was changed from `@microsoft/package-deps-hash` to `@rushstack/package-deps-hash`

## 2.4.4
Tue, 28 Jan 2020 02:23:44 GMT

_Version update only_

## 2.4.3
Fri, 24 Jan 2020 00:27:39 GMT

_Version update only_

## 2.4.2
Thu, 23 Jan 2020 01:07:56 GMT

_Version update only_

## 2.4.1
Tue, 21 Jan 2020 21:56:14 GMT

_Version update only_

## 2.4.0
Sun, 19 Jan 2020 02:26:52 GMT

### Minor changes

- Upgrade Node typings to Node 10

## 2.3.19
Fri, 17 Jan 2020 01:08:23 GMT

_Version update only_

## 2.3.18
Tue, 14 Jan 2020 01:34:16 GMT

_Version update only_

## 2.3.17
Sat, 11 Jan 2020 05:18:24 GMT

_Version update only_

## 2.3.16
Thu, 09 Jan 2020 06:44:13 GMT

_Version update only_

## 2.3.15
Wed, 08 Jan 2020 00:11:31 GMT

_Version update only_

## 2.3.14
Wed, 04 Dec 2019 23:17:55 GMT

_Version update only_

## 2.3.13
Tue, 03 Dec 2019 03:17:44 GMT

_Version update only_

## 2.3.12
Sun, 24 Nov 2019 00:54:04 GMT

_Version update only_

## 2.3.11
Wed, 20 Nov 2019 06:14:28 GMT

_Version update only_

## 2.3.10
Fri, 15 Nov 2019 04:50:50 GMT

_Version update only_

## 2.3.9
Mon, 11 Nov 2019 16:07:56 GMT

_Version update only_

## 2.3.8
Wed, 06 Nov 2019 22:44:18 GMT

_Version update only_

## 2.3.7
Tue, 05 Nov 2019 06:49:29 GMT

_Version update only_

## 2.3.6
Tue, 05 Nov 2019 01:08:39 GMT

_Version update only_

## 2.3.5
Fri, 25 Oct 2019 15:08:54 GMT

_Version update only_

## 2.3.4
Tue, 22 Oct 2019 06:24:44 GMT

_Version update only_

## 2.3.3
Mon, 21 Oct 2019 05:22:43 GMT

_Version update only_

## 2.3.2
Fri, 18 Oct 2019 15:15:01 GMT

_Version update only_

## 2.3.1
Thu, 10 Oct 2019 23:28:59 GMT

### Patches

- Fix an issue where git commands can be too long.

## 2.3.0
Tue, 08 Oct 2019 22:38:39 GMT

### Minor changes

- Expose the gitFileHash function.

## 2.2.183
Sun, 06 Oct 2019 00:27:39 GMT

_Version update only_

## 2.2.182
Fri, 04 Oct 2019 00:15:22 GMT

_Version update only_

## 2.2.181
Sun, 29 Sep 2019 23:56:29 GMT

### Patches

- Update repository URL

## 2.2.180
Wed, 25 Sep 2019 15:15:31 GMT

_Version update only_

## 2.2.179
Tue, 24 Sep 2019 02:58:49 GMT

_Version update only_

## 2.2.178
Mon, 23 Sep 2019 15:14:55 GMT

_Version update only_

## 2.2.177
Fri, 20 Sep 2019 21:27:22 GMT

_Version update only_

## 2.2.176
Wed, 11 Sep 2019 19:56:23 GMT

_Version update only_

## 2.2.175
Tue, 10 Sep 2019 22:32:23 GMT

### Patches

- Update documentation

## 2.2.174
Tue, 10 Sep 2019 20:38:33 GMT

_Version update only_

## 2.2.173
Wed, 04 Sep 2019 18:28:06 GMT

_Version update only_

## 2.2.172
Wed, 04 Sep 2019 15:15:37 GMT

_Version update only_

## 2.2.171
Fri, 30 Aug 2019 00:14:32 GMT

_Version update only_

## 2.2.170
Mon, 12 Aug 2019 15:15:14 GMT

_Version update only_

## 2.2.169
Thu, 08 Aug 2019 15:14:17 GMT

_Version update only_

## 2.2.168
Thu, 08 Aug 2019 00:49:06 GMT

_Version update only_

## 2.2.167
Mon, 05 Aug 2019 22:04:32 GMT

_Version update only_

## 2.2.166
Tue, 23 Jul 2019 19:14:38 GMT

_Version update only_

## 2.2.165
Tue, 23 Jul 2019 01:13:01 GMT

_Version update only_

## 2.2.164
Mon, 22 Jul 2019 19:13:10 GMT

_Version update only_

## 2.2.163
Fri, 12 Jul 2019 19:12:46 GMT

_Version update only_

## 2.2.162
Thu, 11 Jul 2019 19:13:08 GMT

_Version update only_

## 2.2.161
Tue, 09 Jul 2019 19:13:24 GMT

_Version update only_

## 2.2.160
Mon, 08 Jul 2019 19:12:18 GMT

_Version update only_

## 2.2.159
Sat, 29 Jun 2019 02:30:10 GMT

_Version update only_

## 2.2.158
Wed, 12 Jun 2019 19:12:33 GMT

_Version update only_

## 2.2.157
Tue, 11 Jun 2019 00:48:06 GMT

_Version update only_

## 2.2.156
Thu, 06 Jun 2019 22:33:36 GMT

_Version update only_

## 2.2.155
Wed, 05 Jun 2019 19:12:34 GMT

_Version update only_

## 2.2.154
Tue, 04 Jun 2019 05:51:54 GMT

_Version update only_

## 2.2.153
Mon, 27 May 2019 04:13:44 GMT

_Version update only_

## 2.2.152
Mon, 13 May 2019 02:08:35 GMT

_Version update only_

## 2.2.151
Mon, 06 May 2019 20:46:22 GMT

_Version update only_

## 2.2.150
Mon, 06 May 2019 19:34:54 GMT

_Version update only_

## 2.2.149
Mon, 06 May 2019 19:11:16 GMT

_Version update only_

## 2.2.148
Tue, 30 Apr 2019 23:08:02 GMT

_Version update only_

## 2.2.147
Tue, 16 Apr 2019 11:01:37 GMT

_Version update only_

## 2.2.146
Fri, 12 Apr 2019 06:13:17 GMT

_Version update only_

## 2.2.145
Thu, 11 Apr 2019 07:14:01 GMT

_Version update only_

## 2.2.144
Tue, 09 Apr 2019 05:31:01 GMT

_Version update only_

## 2.2.143
Mon, 08 Apr 2019 19:12:53 GMT

_Version update only_

## 2.2.142
Sat, 06 Apr 2019 02:05:51 GMT

_Version update only_

## 2.2.141
Fri, 05 Apr 2019 04:16:17 GMT

_Version update only_

## 2.2.140
Wed, 03 Apr 2019 02:58:33 GMT

_Version update only_

## 2.2.139
Tue, 02 Apr 2019 01:12:02 GMT

_Version update only_

## 2.2.138
Sat, 30 Mar 2019 22:27:16 GMT

_Version update only_

## 2.2.137
Thu, 28 Mar 2019 19:14:27 GMT

_Version update only_

## 2.2.136
Tue, 26 Mar 2019 20:54:18 GMT

_Version update only_

## 2.2.135
Sat, 23 Mar 2019 03:48:31 GMT

_Version update only_

## 2.2.134
Thu, 21 Mar 2019 04:59:11 GMT

_Version update only_

## 2.2.133
Thu, 21 Mar 2019 01:15:33 GMT

_Version update only_

## 2.2.132
Wed, 20 Mar 2019 19:14:49 GMT

_Version update only_

## 2.2.131
Mon, 18 Mar 2019 04:28:43 GMT

_Version update only_

## 2.2.130
Fri, 15 Mar 2019 19:13:25 GMT

_Version update only_

## 2.2.129
Wed, 13 Mar 2019 19:13:14 GMT

_Version update only_

## 2.2.128
Wed, 13 Mar 2019 01:14:05 GMT

_Version update only_

## 2.2.127
Mon, 11 Mar 2019 16:13:36 GMT

_Version update only_

## 2.2.126
Tue, 05 Mar 2019 17:13:11 GMT

_Version update only_

## 2.2.125
Mon, 04 Mar 2019 17:13:20 GMT

_Version update only_

## 2.2.124
Wed, 27 Feb 2019 22:13:58 GMT

_Version update only_

## 2.2.123
Wed, 27 Feb 2019 17:13:17 GMT

_Version update only_

## 2.2.122
Mon, 18 Feb 2019 17:13:23 GMT

_Version update only_

## 2.2.121
Tue, 12 Feb 2019 17:13:12 GMT

_Version update only_

## 2.2.120
Mon, 11 Feb 2019 10:32:37 GMT

_Version update only_

## 2.2.119
Mon, 11 Feb 2019 03:31:55 GMT

_Version update only_

## 2.2.118
Wed, 30 Jan 2019 20:49:12 GMT

_Version update only_

## 2.2.117
Sat, 19 Jan 2019 03:47:47 GMT

_Version update only_

## 2.2.116
Tue, 15 Jan 2019 17:04:09 GMT

_Version update only_

## 2.2.115
Thu, 10 Jan 2019 01:57:53 GMT

_Version update only_

## 2.2.114
Mon, 07 Jan 2019 17:04:07 GMT

_Version update only_

## 2.2.113
Wed, 19 Dec 2018 05:57:33 GMT

_Version update only_

## 2.2.112
Thu, 13 Dec 2018 02:58:11 GMT

_Version update only_

## 2.2.111
Wed, 12 Dec 2018 17:04:19 GMT

_Version update only_

## 2.2.110
Sat, 08 Dec 2018 06:35:36 GMT

_Version update only_

## 2.2.109
Fri, 07 Dec 2018 17:04:56 GMT

_Version update only_

## 2.2.108
Fri, 30 Nov 2018 23:34:58 GMT

_Version update only_

## 2.2.107
Thu, 29 Nov 2018 07:02:09 GMT

_Version update only_

## 2.2.106
Thu, 29 Nov 2018 00:35:39 GMT

_Version update only_

## 2.2.105
Wed, 28 Nov 2018 19:29:53 GMT

_Version update only_

## 2.2.104
Wed, 28 Nov 2018 02:17:11 GMT

_Version update only_

## 2.2.103
Fri, 16 Nov 2018 21:37:10 GMT

_Version update only_

## 2.2.102
Fri, 16 Nov 2018 00:59:00 GMT

_Version update only_

## 2.2.101
Fri, 09 Nov 2018 23:07:39 GMT

_Version update only_

## 2.2.100
Wed, 07 Nov 2018 21:04:35 GMT

_Version update only_

## 2.2.99
Wed, 07 Nov 2018 17:03:03 GMT

_Version update only_

## 2.2.98
Mon, 05 Nov 2018 17:04:24 GMT

_Version update only_

## 2.2.97
Thu, 01 Nov 2018 21:33:52 GMT

_Version update only_

## 2.2.96
Thu, 01 Nov 2018 19:32:52 GMT

_Version update only_

## 2.2.95
Wed, 31 Oct 2018 21:17:50 GMT

_Version update only_

## 2.2.94
Wed, 31 Oct 2018 17:00:55 GMT

_Version update only_

## 2.2.93
Sat, 27 Oct 2018 03:45:51 GMT

_Version update only_

## 2.2.92
Sat, 27 Oct 2018 02:17:18 GMT

_Version update only_

## 2.2.91
Sat, 27 Oct 2018 00:26:56 GMT

_Version update only_

## 2.2.90
Thu, 25 Oct 2018 23:20:40 GMT

_Version update only_

## 2.2.89
Thu, 25 Oct 2018 08:56:02 GMT

_Version update only_

## 2.2.88
Wed, 24 Oct 2018 16:03:10 GMT

_Version update only_

## 2.2.87
Thu, 18 Oct 2018 05:30:14 GMT

_Version update only_

## 2.2.86
Thu, 18 Oct 2018 01:32:21 GMT

_Version update only_

## 2.2.85
Wed, 17 Oct 2018 21:04:49 GMT

_Version update only_

## 2.2.84
Wed, 17 Oct 2018 14:43:24 GMT

_Version update only_

## 2.2.83
Thu, 11 Oct 2018 23:26:07 GMT

_Version update only_

## 2.2.82
Tue, 09 Oct 2018 06:58:02 GMT

_Version update only_

## 2.2.81
Mon, 08 Oct 2018 16:04:27 GMT

_Version update only_

## 2.2.80
Sun, 07 Oct 2018 06:15:56 GMT

_Version update only_

## 2.2.79
Fri, 28 Sep 2018 16:05:35 GMT

_Version update only_

## 2.2.78
Wed, 26 Sep 2018 21:39:40 GMT

_Version update only_

## 2.2.77
Mon, 24 Sep 2018 23:06:40 GMT

_Version update only_

## 2.2.76
Mon, 24 Sep 2018 16:04:28 GMT

_Version update only_

## 2.2.75
Fri, 21 Sep 2018 16:04:42 GMT

_Version update only_

## 2.2.74
Thu, 20 Sep 2018 23:57:22 GMT

_Version update only_

## 2.2.73
Tue, 18 Sep 2018 21:04:56 GMT

_Version update only_

## 2.2.72
Mon, 10 Sep 2018 23:23:01 GMT

_Version update only_

## 2.2.71
Thu, 06 Sep 2018 01:25:26 GMT

### Patches

- Update "repository" field in package.json

## 2.2.70
Tue, 04 Sep 2018 21:34:10 GMT

_Version update only_

## 2.2.69
Mon, 03 Sep 2018 16:04:46 GMT

_Version update only_

## 2.2.68
Thu, 30 Aug 2018 22:47:34 GMT

_Version update only_

## 2.2.67
Thu, 30 Aug 2018 19:23:16 GMT

_Version update only_

## 2.2.66
Thu, 30 Aug 2018 18:45:12 GMT

_Version update only_

## 2.2.65
Wed, 29 Aug 2018 21:43:23 GMT

_Version update only_

## 2.2.64
Wed, 29 Aug 2018 06:36:50 GMT

_Version update only_

## 2.2.63
Thu, 23 Aug 2018 18:18:53 GMT

### Patches

- Republish all packages in web-build-tools to resolve GitHub issue #782

## 2.2.62
Wed, 22 Aug 2018 20:58:58 GMT

_Version update only_

## 2.2.61
Wed, 22 Aug 2018 16:03:25 GMT

_Version update only_

## 2.2.60
Tue, 21 Aug 2018 16:04:38 GMT

_Version update only_

## 2.2.59
Thu, 09 Aug 2018 21:58:02 GMT

_Version update only_

## 2.2.58
Thu, 09 Aug 2018 21:03:22 GMT

_Version update only_

## 2.2.57
Thu, 09 Aug 2018 16:04:24 GMT

_Version update only_

## 2.2.56
Tue, 07 Aug 2018 22:27:31 GMT

_Version update only_

## 2.2.55
Thu, 26 Jul 2018 23:53:43 GMT

_Version update only_

## 2.2.54
Thu, 26 Jul 2018 16:04:17 GMT

_Version update only_

## 2.2.53
Wed, 25 Jul 2018 21:02:57 GMT

_Version update only_

## 2.2.52
Fri, 20 Jul 2018 16:04:52 GMT

_Version update only_

## 2.2.51
Tue, 17 Jul 2018 16:02:52 GMT

_Version update only_

## 2.2.50
Fri, 13 Jul 2018 19:04:50 GMT

_Version update only_

## 2.2.49
Wed, 11 Jul 2018 21:03:58 GMT

### Patches

- Fix an issue where package-deps-hash did not correctly handle staged file renames.

## 2.2.48
Tue, 03 Jul 2018 21:03:31 GMT

_Version update only_

## 2.2.47
Fri, 29 Jun 2018 02:56:51 GMT

_Version update only_

## 2.2.46
Sat, 23 Jun 2018 02:21:20 GMT

_Version update only_

## 2.2.45
Fri, 22 Jun 2018 16:05:15 GMT

_Version update only_

## 2.2.44
Thu, 21 Jun 2018 08:27:29 GMT

_Version update only_

## 2.2.43
Tue, 19 Jun 2018 19:35:11 GMT

_Version update only_

## 2.2.42
Fri, 08 Jun 2018 08:43:52 GMT

_Version update only_

## 2.2.41
Thu, 31 May 2018 01:39:33 GMT

_Version update only_

## 2.2.40
Tue, 15 May 2018 02:26:45 GMT

_Version update only_

## 2.2.39
Tue, 15 May 2018 00:18:10 GMT

_Version update only_

## 2.2.38
Fri, 11 May 2018 22:43:14 GMT

_Version update only_

## 2.2.37
Fri, 04 May 2018 00:42:38 GMT

_Version update only_

## 2.2.36
Tue, 01 May 2018 22:03:20 GMT

_Version update only_

## 2.2.35
Fri, 27 Apr 2018 03:04:32 GMT

_Version update only_

## 2.2.34
Fri, 20 Apr 2018 16:06:11 GMT

_Version update only_

## 2.2.33
Thu, 19 Apr 2018 21:25:56 GMT

_Version update only_

## 2.2.32
Thu, 19 Apr 2018 17:02:06 GMT

_Version update only_

## 2.2.31
Tue, 03 Apr 2018 16:05:29 GMT

_Version update only_

## 2.2.30
Mon, 02 Apr 2018 16:05:24 GMT

_Version update only_

## 2.2.29
Tue, 27 Mar 2018 01:34:25 GMT

_Version update only_

## 2.2.28
Mon, 26 Mar 2018 19:12:42 GMT

_Version update only_

## 2.2.27
Sun, 25 Mar 2018 01:26:19 GMT

### Patches

- Change *.d.ts file path

## 2.2.26
Fri, 23 Mar 2018 00:34:53 GMT

_Version update only_

## 2.2.25
Thu, 22 Mar 2018 18:34:13 GMT

_Version update only_

## 2.2.24
Tue, 20 Mar 2018 02:44:45 GMT

_Version update only_

## 2.2.23
Sat, 17 Mar 2018 02:54:22 GMT

_Version update only_

## 2.2.22
Thu, 15 Mar 2018 20:00:50 GMT

_Version update only_

## 2.2.21
Thu, 15 Mar 2018 16:05:43 GMT

_Version update only_

## 2.2.20
Tue, 13 Mar 2018 23:11:32 GMT

_Version update only_

## 2.2.19
Mon, 12 Mar 2018 20:36:19 GMT

_Version update only_

## 2.2.18
Tue, 06 Mar 2018 17:04:51 GMT

_Version update only_

## 2.2.17
Fri, 02 Mar 2018 01:13:59 GMT

_Version update only_

## 2.2.16
Tue, 27 Feb 2018 22:05:57 GMT

_Version update only_

## 2.2.15
Wed, 21 Feb 2018 22:04:19 GMT

_Version update only_

## 2.2.14
Wed, 21 Feb 2018 03:13:29 GMT

_Version update only_

## 2.2.13
Sat, 17 Feb 2018 02:53:49 GMT

_Version update only_

## 2.2.12
Fri, 16 Feb 2018 22:05:23 GMT

_Version update only_

## 2.2.11
Fri, 16 Feb 2018 17:05:11 GMT

_Version update only_

## 2.2.10
Wed, 07 Feb 2018 17:05:11 GMT

_Version update only_

## 2.2.9
Fri, 26 Jan 2018 22:05:30 GMT

_Version update only_

## 2.2.8
Fri, 26 Jan 2018 17:53:38 GMT

### Patches

- Force a patch bump in case the previous version was an empty package

## 2.2.7
Fri, 26 Jan 2018 00:36:51 GMT

_Version update only_

## 2.2.6
Tue, 23 Jan 2018 17:05:28 GMT

_Version update only_

## 2.2.5
Thu, 18 Jan 2018 03:23:46 GMT

### Patches

- Enable package typings generated by api-extractor

## 2.2.4
Thu, 18 Jan 2018 00:48:06 GMT

_Version update only_

## 2.2.3
Wed, 17 Jan 2018 10:49:31 GMT

_Version update only_

## 2.2.2
Fri, 12 Jan 2018 03:35:22 GMT

_Version update only_

## 2.2.1
Thu, 11 Jan 2018 22:31:51 GMT

_Version update only_

## 2.2.0
Wed, 10 Jan 2018 20:40:01 GMT

### Minor changes

- Upgrade to Node 8

## 2.1.13
Sun, 07 Jan 2018 05:12:08 GMT

_Version update only_

## 2.1.12
Fri, 05 Jan 2018 20:26:45 GMT

_Version update only_

## 2.1.11
Fri, 05 Jan 2018 00:48:41 GMT

_Version update only_

## 2.1.10
Fri, 22 Dec 2017 17:04:46 GMT

_Version update only_

## 2.1.9
Tue, 12 Dec 2017 03:33:27 GMT

_Version update only_

## 2.1.8
Thu, 30 Nov 2017 23:59:09 GMT

_Version update only_

## 2.1.7
Thu, 30 Nov 2017 23:12:21 GMT

_Version update only_

## 2.1.6
Wed, 29 Nov 2017 17:05:37 GMT

_Version update only_

## 2.1.5
Tue, 28 Nov 2017 23:43:55 GMT

_Version update only_

## 2.1.4
Mon, 13 Nov 2017 17:04:50 GMT

_Version update only_

## 2.1.3
Mon, 06 Nov 2017 17:04:18 GMT

_Version update only_

## 2.1.2
Thu, 02 Nov 2017 16:05:24 GMT

### Patches

- lock the reference version between web build tools projects

## 2.1.1
Tue, 24 Oct 2017 18:17:12 GMT

_Version update only_

## 2.1.0
Fri, 22 Sep 2017 01:04:02 GMT

### Minor changes

- Upgrade to es6

## 2.0.10
Fri, 15 Sep 2017 01:04:06 GMT

### Patches

- Don't show Git errors if this is not a Git repository

## 2.0.9
Fri, 08 Sep 2017 01:28:04 GMT

### Patches

- Deprecate @types/es6-coll ections in favor of built-in typescript typings 'es2015.collection' a nd 'es2015.iterable'

## 2.0.8
Thu, 31 Aug 2017 18:41:18 GMT

_Version update only_

## 2.0.7
Wed, 30 Aug 2017 01:04:34 GMT

_Version update only_

## 2.0.6
Tue, 22 Aug 2017 13:04:22 GMT

_Version update only_

## 2.0.5
Thu, 22 Jun 2017 01:03:47 GMT

### Patches

- Fix an issue where Git submodules were unable to be hashed

## 2.0.4
Wed, 21 Jun 2017 04:19:35 GMT

### Patches

- Add missing API Extractor release tags

## 2.0.2
Wed, 19 Apr 2017 20:18:06 GMT

### Patches

- Remove ES6 Promise & @types/es6-promise typings

## 2.0.1
Wed, 15 Mar 2017 01:32:09 GMT

### Patches

- Locking `@types` packages. Synchronizing version specifiers for dependencies with other `web-build-tools` projects.

## 2.0.0
Mon, 30 Jan 2017 21:37:27 GMT

### Breaking changes

- Update package-deps-hash to not be asynchronous, and fixes a bug where not all changes were reported.

## 1.0.1
Fri, 13 Jan 2017 06:46:05 GMT

_Initial release_

