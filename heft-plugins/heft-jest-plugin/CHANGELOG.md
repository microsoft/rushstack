# Change Log - @rushstack/heft-jest-plugin

This log was last generated on Fri, 24 Oct 2025 00:13:38 GMT and should not be manually modified.

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

## 0.16.15
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.16.14
Fri, 12 Sep 2025 15:13:07 GMT

_Version update only_

## 0.16.13
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.16.12
Tue, 19 Aug 2025 20:45:02 GMT

_Version update only_

## 0.16.11
Fri, 01 Aug 2025 00:12:49 GMT

_Version update only_

## 0.16.10
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.16.9
Sat, 21 Jun 2025 00:13:15 GMT

_Version update only_

## 0.16.8
Tue, 13 May 2025 02:09:20 GMT

_Version update only_

## 0.16.7
Thu, 01 May 2025 15:11:33 GMT

_Version update only_

## 0.16.6
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.16.5
Fri, 25 Apr 2025 00:11:32 GMT

_Version update only_

## 0.16.4
Mon, 21 Apr 2025 22:24:25 GMT

_Version update only_

## 0.16.3
Thu, 17 Apr 2025 00:11:21 GMT

_Version update only_

## 0.16.2
Tue, 15 Apr 2025 15:11:57 GMT

_Version update only_

## 0.16.1
Wed, 09 Apr 2025 00:11:02 GMT

_Version update only_

## 0.16.0
Fri, 04 Apr 2025 18:34:35 GMT

### Minor changes

- (BREAKING CHANGE) Update `jest-string-mock-transform` to emit slash-normalized relative paths to files, rather than absolute paths, to ensure portability of snapshots.

## 0.15.3
Tue, 25 Mar 2025 15:11:16 GMT

_Version update only_

## 0.15.2
Wed, 12 Mar 2025 22:41:36 GMT

_Version update only_

## 0.15.1
Wed, 12 Mar 2025 00:11:31 GMT

_Version update only_

## 0.15.0
Tue, 11 Mar 2025 02:12:33 GMT

### Minor changes

- Use `useNodeJSResolver: true` in `Import.resolvePackage` calls.

## 0.14.13
Tue, 11 Mar 2025 00:11:25 GMT

_Version update only_

## 0.14.12
Sat, 01 Mar 2025 05:00:09 GMT

_Version update only_

## 0.14.11
Thu, 27 Feb 2025 01:10:39 GMT

_Version update only_

## 0.14.10
Wed, 26 Feb 2025 16:11:11 GMT

_Version update only_

## 0.14.9
Sat, 22 Feb 2025 01:11:12 GMT

_Version update only_

## 0.14.8
Wed, 19 Feb 2025 18:53:48 GMT

_Version update only_

## 0.14.7
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.14.6
Fri, 07 Feb 2025 01:10:49 GMT

### Patches

- Extend heft-jest-plugin json schema to match HeftJestConfiguration

## 0.14.5
Thu, 30 Jan 2025 16:10:36 GMT

_Version update only_

## 0.14.4
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.14.3
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.14.2
Tue, 07 Jan 2025 22:17:32 GMT

_Version update only_

## 0.14.1
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.14.0
Tue, 10 Dec 2024 07:32:19 GMT

### Minor changes

- Inject `punycode` into the NodeJS module cache in Node versions 22 and above to work around a deprecation warning.

## 0.13.3
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.13.2
Tue, 03 Dec 2024 16:11:07 GMT

_Version update only_

## 0.13.1
Sat, 23 Nov 2024 01:18:55 GMT

### Patches

- Fix a bug in `jest-node-modules-symlink-resolver` with respect to evaluating paths that don't exist. Expected behavior in that situation is to return the input path.

## 0.13.0
Fri, 22 Nov 2024 01:10:43 GMT

### Minor changes

- Add a custom resolver that only resolves symlinks that are within node_modules.

## 0.12.18
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.12.17
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.12.16
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.12.15
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.12.14
Wed, 02 Oct 2024 00:11:19 GMT

_Version update only_

## 0.12.13
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.12.12
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.12.11
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.12.10
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.12.9
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.12.8
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.12.7
Fri, 02 Aug 2024 17:26:42 GMT

_Version update only_

## 0.12.6
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.12.5
Wed, 24 Jul 2024 00:12:14 GMT

_Version update only_

## 0.12.4
Wed, 17 Jul 2024 06:55:09 GMT

_Version update only_

## 0.12.3
Wed, 17 Jul 2024 00:11:19 GMT

_Version update only_

## 0.12.2
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 0.12.1
Thu, 27 Jun 2024 21:01:36 GMT

_Version update only_

## 0.12.0
Tue, 11 Jun 2024 00:21:28 GMT

### Minor changes

- Update the test reporter to report unchecked snapshots.

## 0.11.39
Mon, 03 Jun 2024 23:43:15 GMT

_Version update only_

## 0.11.38
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.11.37
Wed, 29 May 2024 02:03:50 GMT

_Version update only_

## 0.11.36
Wed, 29 May 2024 00:10:52 GMT

_Version update only_

## 0.11.35
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.11.34
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.11.33
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.11.32
Fri, 24 May 2024 00:15:09 GMT

_Version update only_

## 0.11.31
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.11.30
Thu, 16 May 2024 15:10:22 GMT

_Version update only_

## 0.11.29
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.11.28
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.11.27
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.11.26
Wed, 08 May 2024 22:23:51 GMT

_Version update only_

## 0.11.25
Mon, 06 May 2024 15:11:04 GMT

_Version update only_

## 0.11.24
Wed, 10 Apr 2024 15:10:09 GMT

_Version update only_

## 0.11.23
Tue, 19 Mar 2024 15:10:18 GMT

_Version update only_

## 0.11.22
Fri, 15 Mar 2024 00:12:40 GMT

_Version update only_

## 0.11.21
Tue, 05 Mar 2024 01:19:24 GMT

_Version update only_

## 0.11.20
Sun, 03 Mar 2024 20:58:13 GMT

_Version update only_

## 0.11.19
Sat, 02 Mar 2024 02:22:24 GMT

_Version update only_

## 0.11.18
Fri, 01 Mar 2024 01:10:08 GMT

_Version update only_

## 0.11.17
Thu, 29 Feb 2024 07:11:45 GMT

_Version update only_

## 0.11.16
Wed, 28 Feb 2024 16:09:27 GMT

_Version update only_

## 0.11.15
Mon, 26 Feb 2024 16:10:56 GMT

### Patches

- Make `@rushstack/terminal` a dependency because the reporter has a runtime dependency on that package.

## 0.11.14
Thu, 22 Feb 2024 05:54:17 GMT

### Patches

- Add a missing dependency on `@rushstack/terminal`

## 0.11.13
Thu, 22 Feb 2024 01:36:09 GMT

_Version update only_

## 0.11.12
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.11.11
Wed, 21 Feb 2024 08:55:47 GMT

_Version update only_

## 0.11.10
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.11.9
Tue, 20 Feb 2024 16:10:53 GMT

_Version update only_

## 0.11.8
Mon, 19 Feb 2024 21:54:26 GMT

_Version update only_

## 0.11.7
Sat, 17 Feb 2024 06:24:35 GMT

_Version update only_

## 0.11.6
Thu, 08 Feb 2024 01:09:21 GMT

_Version update only_

## 0.11.5
Wed, 07 Feb 2024 01:11:18 GMT

_Version update only_

## 0.11.4
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.11.3
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.11.2
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 0.11.1
Tue, 23 Jan 2024 16:15:05 GMT

_Version update only_

## 0.11.0
Tue, 16 Jan 2024 18:30:10 GMT

### Minor changes

- Add support for TypeScript 5.3

## 0.10.8
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 0.10.7
Wed, 20 Dec 2023 01:09:46 GMT

_Version update only_

## 0.10.6
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 0.10.5
Tue, 05 Dec 2023 01:10:16 GMT

_Version update only_

## 0.10.4
Fri, 10 Nov 2023 18:02:04 GMT

_Version update only_

## 0.10.3
Wed, 01 Nov 2023 23:11:35 GMT

### Patches

- Fix line endings in published package.

## 0.10.2
Mon, 30 Oct 2023 23:36:38 GMT

_Version update only_

## 0.10.1
Thu, 26 Oct 2023 00:27:48 GMT

### Patches

- Add an option (`enableNodeEnvManagement`) to ensure that the NODE_ENV environment variable is set to `"test"` during test execution.

## 0.10.0
Mon, 23 Oct 2023 15:18:38 GMT

### Minor changes

- Use Jest verbose logging when `heft --debug test` or `heft test --verbose` is specified
- Fix an issue where `silent: true` was ignored when specified in `jest.config.json`

## 0.9.9
Sun, 01 Oct 2023 02:56:30 GMT

_Version update only_

## 0.9.8
Sat, 30 Sep 2023 00:20:51 GMT

_Version update only_

## 0.9.7
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 0.9.6
Wed, 27 Sep 2023 00:21:38 GMT

_Version update only_

## 0.9.5
Tue, 26 Sep 2023 21:02:30 GMT

_Version update only_

## 0.9.4
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.9.3
Mon, 25 Sep 2023 23:38:28 GMT

_Version update only_

## 0.9.2
Fri, 22 Sep 2023 00:05:50 GMT

_Version update only_

## 0.9.1
Tue, 19 Sep 2023 15:21:51 GMT

_Version update only_

## 0.9.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Add a `--log-heap-usage` flag that includes memory usage analysis in each test run.
- Update @types/node from 14 to 18

### Patches

- Wait for first test run to be scheduled in initial invocation in watch mode.

## 0.8.1
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.8.0
Mon, 31 Jul 2023 15:19:05 GMT

### Minor changes

- Make `jest-environment-jsdom` and `jest-environment-node` optional peerDependencies.

## 0.7.18
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.7.17
Thu, 20 Jul 2023 20:47:29 GMT

_Version update only_

## 0.7.16
Wed, 19 Jul 2023 00:20:31 GMT

_Version update only_

## 0.7.15
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.7.14
Wed, 12 Jul 2023 15:20:40 GMT

_Version update only_

## 0.7.13
Fri, 07 Jul 2023 00:19:33 GMT

_Version update only_

## 0.7.12
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.7.11
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.7.10
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.7.9
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.7.8
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.7.7
Tue, 13 Jun 2023 01:49:01 GMT

### Patches

- Add support for using '-u' for the '--update-snapshots' parameter and '-t' for the '--test-name-pattern' parameter

## 0.7.6
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.7.5
Fri, 09 Jun 2023 15:23:15 GMT

### Patches

- Added --test-path-ignore-patterns support for subtractive test selection to complement existing additive support.

## 0.7.4
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 0.7.3
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.7.2
Thu, 08 Jun 2023 00:20:03 GMT

_Version update only_

## 0.7.1
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 0.7.0
Tue, 06 Jun 2023 02:52:51 GMT

### Minor changes

- Adds a new base config for web projects, jest-web.config.json. Adds the "customExportConditions" field to both base configs with sensible defaults.

## 0.6.0
Fri, 02 Jun 2023 02:01:12 GMT

### Minor changes

- Refactor for multi-phase Heft. See @rushstack/heft/UPGRADING.md.

## 0.5.13
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.5.12
Mon, 22 May 2023 06:34:32 GMT

_Version update only_

## 0.5.11
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 0.5.10
Thu, 04 May 2023 00:20:28 GMT

_Version update only_

## 0.5.9
Mon, 01 May 2023 15:23:19 GMT

### Patches

- Allow "preset" configuration value to be used when extending Jest configuration files

## 0.5.8
Sat, 29 Apr 2023 00:23:02 GMT

_Version update only_

## 0.5.7
Thu, 27 Apr 2023 17:18:42 GMT

_Version update only_

## 0.5.6
Tue, 04 Apr 2023 22:36:28 GMT

### Patches

- Upgrade Jest to 29.5.0.

## 0.5.5
Sat, 18 Mar 2023 00:20:56 GMT

_Version update only_

## 0.5.4
Fri, 10 Feb 2023 01:18:50 GMT

_Version update only_

## 0.5.3
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 0.5.2
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 0.5.1
Mon, 30 Jan 2023 16:22:31 GMT

_Version update only_

## 0.5.0
Mon, 30 Jan 2023 00:55:44 GMT

### Minor changes

- Upgrade Jest from `~27.4.2` to `~29.3.1`

## 0.4.5
Thu, 26 Jan 2023 02:55:10 GMT

_Version update only_

## 0.4.4
Wed, 25 Jan 2023 07:26:55 GMT

_Version update only_

## 0.4.3
Wed, 18 Jan 2023 22:44:12 GMT

_Version update only_

## 0.4.2
Tue, 20 Dec 2022 01:18:22 GMT

_Version update only_

## 0.4.1
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 0.4.0
Tue, 29 Nov 2022 01:16:49 GMT

### Minor changes

- Remove a postinstall step that patches Jest in-place. This is better achieved with a PNPM patch. See https://github.com/microsoft/rushstack/pull/3790 for more information.

## 0.3.45
Tue, 08 Nov 2022 01:20:55 GMT

_Version update only_

## 0.3.44
Wed, 26 Oct 2022 00:16:16 GMT

_Version update only_

## 0.3.43
Mon, 17 Oct 2022 22:14:21 GMT

_Version update only_

## 0.3.42
Mon, 17 Oct 2022 15:16:00 GMT

_Version update only_

## 0.3.41
Fri, 14 Oct 2022 15:26:32 GMT

_Version update only_

## 0.3.40
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 0.3.39
Tue, 11 Oct 2022 23:49:12 GMT

_Version update only_

## 0.3.38
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 0.3.37
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 0.3.36
Tue, 27 Sep 2022 22:17:20 GMT

_Version update only_

## 0.3.35
Wed, 21 Sep 2022 20:21:10 GMT

_Version update only_

## 0.3.34
Thu, 15 Sep 2022 00:18:51 GMT

_Version update only_

## 0.3.33
Tue, 13 Sep 2022 00:16:55 GMT

_Version update only_

## 0.3.32
Mon, 12 Sep 2022 22:27:48 GMT

_Version update only_

## 0.3.31
Fri, 02 Sep 2022 17:48:43 GMT

_Version update only_

## 0.3.30
Wed, 31 Aug 2022 01:45:06 GMT

### Patches

- Hide disabling Jest cache behind environment variable "HEFT_JEST_DISABLE_CACHE"

## 0.3.29
Wed, 31 Aug 2022 00:42:46 GMT

### Patches

- Disable reading and writing of Jest cache due to unexpected caching behavior

## 0.3.28
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 0.3.27
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 0.3.26
Fri, 19 Aug 2022 00:17:19 GMT

_Version update only_

## 0.3.25
Wed, 10 Aug 2022 09:52:12 GMT

_Version update only_

## 0.3.24
Wed, 10 Aug 2022 08:12:16 GMT

_Version update only_

## 0.3.23
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 0.3.22
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 0.3.21
Thu, 21 Jul 2022 23:30:27 GMT

_Version update only_

## 0.3.20
Thu, 21 Jul 2022 00:16:14 GMT

_Version update only_

## 0.3.19
Wed, 13 Jul 2022 21:31:13 GMT

_Version update only_

## 0.3.18
Fri, 08 Jul 2022 15:17:47 GMT

_Version update only_

## 0.3.17
Mon, 04 Jul 2022 15:15:13 GMT

_Version update only_

## 0.3.16
Thu, 30 Jun 2022 04:48:54 GMT

_Version update only_

## 0.3.15
Tue, 28 Jun 2022 22:47:13 GMT

_Version update only_

## 0.3.14
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 0.3.13
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 0.3.12
Sat, 25 Jun 2022 21:00:40 GMT

_Version update only_

## 0.3.11
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 0.3.10
Fri, 24 Jun 2022 07:16:47 GMT

_Version update only_

## 0.3.9
Thu, 23 Jun 2022 22:14:24 GMT

_Version update only_

## 0.3.8
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 0.3.7
Fri, 17 Jun 2022 00:16:18 GMT

### Patches

- Fix resolution of "jest-environment-node" and "jest-environment-jsdom" with strict dependencies.

## 0.3.6
Tue, 07 Jun 2022 09:37:05 GMT

_Version update only_

## 0.3.5
Wed, 25 May 2022 22:25:07 GMT

_Version update only_

## 0.3.4
Thu, 19 May 2022 15:13:20 GMT

_Version update only_

## 0.3.3
Sat, 14 May 2022 03:01:27 GMT

_Version update only_

## 0.3.2
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 0.3.1
Wed, 04 May 2022 23:29:13 GMT

_Version update only_

## 0.3.0
Tue, 26 Apr 2022 00:10:15 GMT

### Minor changes

- (BREAKING CHANGE) Enable clearMocks: true by default

### Patches

- Add command-line flag for disabling code coverage.

## 0.2.15
Sat, 23 Apr 2022 02:13:06 GMT

_Version update only_

## 0.2.14
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 0.2.13
Wed, 13 Apr 2022 15:12:41 GMT

_Version update only_

## 0.2.12
Tue, 12 Apr 2022 23:29:34 GMT

_Version update only_

## 0.2.11
Tue, 12 Apr 2022 02:58:32 GMT

_Version update only_

## 0.2.10
Sat, 09 Apr 2022 19:07:48 GMT

_Version update only_

## 0.2.9
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 0.2.8
Fri, 08 Apr 2022 20:05:59 GMT

_Version update only_

## 0.2.7
Wed, 06 Apr 2022 22:35:23 GMT

_Version update only_

## 0.2.6
Thu, 31 Mar 2022 02:06:05 GMT

_Version update only_

## 0.2.5
Sat, 19 Mar 2022 08:05:38 GMT

_Version update only_

## 0.2.4
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 0.2.3
Fri, 11 Feb 2022 10:30:25 GMT

### Patches

- Update JSON schema documentation

## 0.2.2
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 0.2.1
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 0.2.0
Tue, 14 Dec 2021 19:27:51 GMT

### Minor changes

- Upgrade Jest to v27

## 0.1.53
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

## 0.1.52
Thu, 09 Dec 2021 00:21:54 GMT

_Version update only_

## 0.1.51
Wed, 08 Dec 2021 19:05:08 GMT

_Version update only_

## 0.1.50
Wed, 08 Dec 2021 16:14:05 GMT

_Version update only_

## 0.1.49
Mon, 06 Dec 2021 16:08:32 GMT

_Version update only_

## 0.1.48
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 0.1.47
Mon, 29 Nov 2021 07:26:16 GMT

_Version update only_

## 0.1.46
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 0.1.45
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 0.1.44
Thu, 28 Oct 2021 00:08:22 GMT

_Version update only_

## 0.1.43
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 0.1.42
Wed, 13 Oct 2021 15:09:54 GMT

_Version update only_

## 0.1.41
Fri, 08 Oct 2021 09:35:07 GMT

_Version update only_

## 0.1.40
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 0.1.39
Thu, 07 Oct 2021 23:43:12 GMT

_Version update only_

## 0.1.38
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 0.1.37
Wed, 06 Oct 2021 15:08:26 GMT

_Version update only_

## 0.1.36
Wed, 06 Oct 2021 02:41:48 GMT

_Version update only_

## 0.1.35
Tue, 05 Oct 2021 15:08:37 GMT

_Version update only_

## 0.1.34
Mon, 04 Oct 2021 15:10:18 GMT

_Version update only_

## 0.1.33
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 0.1.32
Thu, 23 Sep 2021 00:10:40 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 0.1.31
Wed, 22 Sep 2021 03:27:12 GMT

_Version update only_

## 0.1.30
Wed, 22 Sep 2021 00:09:32 GMT

_Version update only_

## 0.1.29
Sat, 18 Sep 2021 03:05:57 GMT

_Version update only_

## 0.1.28
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 0.1.27
Mon, 13 Sep 2021 15:07:05 GMT

_Version update only_

## 0.1.26
Fri, 10 Sep 2021 15:08:28 GMT

_Version update only_

## 0.1.25
Wed, 08 Sep 2021 19:06:22 GMT

_Version update only_

## 0.1.24
Wed, 08 Sep 2021 00:08:03 GMT

_Version update only_

## 0.1.23
Fri, 03 Sep 2021 00:09:09 GMT

### Patches

- Use package name as Jest 'displayName' by default and always log a test duration.

## 0.1.22
Tue, 31 Aug 2021 00:07:11 GMT

_Version update only_

## 0.1.21
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 0.1.20
Fri, 20 Aug 2021 15:08:10 GMT

_Version update only_

## 0.1.19
Thu, 12 Aug 2021 18:11:18 GMT

_Version update only_

## 0.1.18
Thu, 12 Aug 2021 01:28:38 GMT

_Version update only_

## 0.1.17
Wed, 11 Aug 2021 23:14:17 GMT

_Version update only_

## 0.1.16
Wed, 11 Aug 2021 00:07:21 GMT

_Version update only_

## 0.1.15
Sat, 31 Jul 2021 00:52:11 GMT

_Version update only_

## 0.1.14
Wed, 14 Jul 2021 15:06:29 GMT

_Version update only_

## 0.1.13
Tue, 13 Jul 2021 23:00:33 GMT

_Version update only_

## 0.1.12
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 0.1.11
Thu, 08 Jul 2021 23:41:17 GMT

_Version update only_

## 0.1.10
Thu, 08 Jul 2021 06:00:48 GMT

_Version update only_

## 0.1.9
Thu, 01 Jul 2021 15:08:27 GMT

_Version update only_

## 0.1.8
Wed, 30 Jun 2021 19:16:19 GMT

### Patches

- Fix Jest configuration merging of "transform" and "moduleNameMapper" fields

## 0.1.7
Wed, 30 Jun 2021 15:06:54 GMT

_Version update only_

## 0.1.6
Wed, 30 Jun 2021 01:37:17 GMT

### Patches

- Improve resolution logic to match closer to default Jest functionality and add "<configDir>" and "<packageDir:...>" tokens to improve flexibility when using extended configuration files

## 0.1.5
Fri, 25 Jun 2021 00:08:28 GMT

_Version update only_

## 0.1.4
Fri, 18 Jun 2021 06:23:05 GMT

### Patches

- Fix a regression where "testEnvironment" did not resolve correctly (GitHub #2745)
- Enable "@rushstack/heft-jest-plugin/lib/exports/jest-global-setup.js" to resolve for rigged projects that don't have a direct dependency on that package

## 0.1.3
Wed, 16 Jun 2021 18:53:52 GMT

### Patches

- Fix an incorrect "peerDependencies" entry that caused installation failures (GitHub #2754)

## 0.1.2
Fri, 11 Jun 2021 23:26:16 GMT

### Patches

- Resolve the "testEnvironment" Jest configuration property in jest.config.json

## 0.1.1
Fri, 11 Jun 2021 00:34:02 GMT

### Patches

- Initial implementation

