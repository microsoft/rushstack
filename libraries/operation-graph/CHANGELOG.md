# Change Log - @rushstack/operation-graph

This log was last generated on Wed, 08 Oct 2025 00:13:29 GMT and should not be manually modified.

## 0.5.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 0.5.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 0.4.1
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 0.4.0
Tue, 30 Sep 2025 20:33:51 GMT

### Minor changes

- Require the "requestor" parameter and add a new "detail" parameter for watch-mode rerun requests. Make "name" a required field for operations.
- (BREAKING CHANGE) Revert the extensibility points for `(before/after)ExecuteOperation(Group)?Async` to be synchronous to signify that they are only meant for logging, not for expensive work.

## 0.3.2
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.3.1
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.3.0
Sat, 21 Jun 2025 00:13:15 GMT

### Minor changes

- (BREAKING CHANGE) The OperationExecutionManager `beforeExecute` and `afterExecute` hooks have been made async and renamed to `beforeExecuteAsync` and `afterExecuteAsync`. Operations now have an optional `metadata` field that can be used to store arbitrary data.

## 0.2.41
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.2.40
Tue, 25 Mar 2025 15:11:15 GMT

_Version update only_

## 0.2.39
Tue, 11 Mar 2025 02:12:33 GMT

_Version update only_

## 0.2.38
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.2.37
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.2.36
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.2.35
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.2.34
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.2.33
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.2.32
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.2.31
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.2.30
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.2.29
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.2.28
Wed, 17 Jul 2024 06:55:10 GMT

_Version update only_

## 0.2.27
Wed, 17 Jul 2024 00:11:19 GMT

### Patches

- Handle errors when sending IPC messages to host.

## 0.2.26
Tue, 16 Jul 2024 00:36:21 GMT

_Version update only_

## 0.2.25
Thu, 30 May 2024 00:13:05 GMT

_Version update only_

## 0.2.24
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 0.2.23
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.2.22
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.2.21
Sat, 25 May 2024 04:54:07 GMT

_Version update only_

## 0.2.20
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.2.19
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.2.18
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.2.17
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.2.16
Mon, 06 May 2024 15:11:05 GMT

_Version update only_

## 0.2.15
Wed, 10 Apr 2024 15:10:08 GMT

_Version update only_

## 0.2.14
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.2.13
Thu, 22 Feb 2024 01:36:09 GMT

### Patches

- Fix memory leaks on abort controllers.

## 0.2.12
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.2.11
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.2.10
Mon, 19 Feb 2024 21:54:27 GMT

_Version update only_

## 0.2.9
Sat, 17 Feb 2024 06:24:35 GMT

### Patches

- Fix broken link to API documentation

## 0.2.8
Thu, 08 Feb 2024 01:09:22 GMT

_Version update only_

## 0.2.7
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.2.6
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.2.5
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 0.2.4
Tue, 23 Jan 2024 16:15:05 GMT

_Version update only_

## 0.2.3
Tue, 16 Jan 2024 18:30:10 GMT

### Patches

- Upgrade build dependencies

## 0.2.2
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 0.2.1
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 0.2.0
Thu, 28 Sep 2023 20:53:17 GMT

### Minor changes

- Enforce task concurrency limits and respect priority for sequencing.

## 0.1.2
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.1.1
Mon, 25 Sep 2023 23:38:27 GMT

### Patches

- Add OperationStatus.Waiting to possible states in watcher loop, add exhaustiveness check.

## 0.1.0
Tue, 19 Sep 2023 15:21:51 GMT

### Minor changes

- Initial commit. Includes IPC support and watch loop.

