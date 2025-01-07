# Change Log - @rushstack/webpack-workspace-resolve-plugin

This log was last generated on Wed, 18 Dec 2024 01:11:33 GMT and should not be manually modified.

## 0.3.18
Wed, 18 Dec 2024 01:11:33 GMT

### Patches

- Fix a bug with path handling on Windows. Tap hooks earlier to ensure that these plugins run before builtin behavior.

## 0.3.17
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.3.16
Mon, 09 Dec 2024 20:31:43 GMT

_Version update only_

## 0.3.15
Tue, 03 Dec 2024 16:11:08 GMT

_Version update only_

## 0.3.14
Sat, 23 Nov 2024 01:18:55 GMT

_Version update only_

## 0.3.13
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.3.12
Thu, 24 Oct 2024 00:15:48 GMT

_Version update only_

## 0.3.11
Mon, 21 Oct 2024 18:50:10 GMT

_Version update only_

## 0.3.10
Thu, 17 Oct 2024 20:25:42 GMT

_Version update only_

## 0.3.9
Thu, 17 Oct 2024 08:35:06 GMT

_Version update only_

## 0.3.8
Tue, 15 Oct 2024 00:12:31 GMT

_Version update only_

## 0.3.7
Thu, 03 Oct 2024 15:11:00 GMT

_Version update only_

## 0.3.6
Wed, 02 Oct 2024 00:11:19 GMT

### Patches

- Ensure compatibility with webpack 5.95.0

## 0.3.5
Tue, 01 Oct 2024 00:11:28 GMT

_Version update only_

## 0.3.4
Mon, 30 Sep 2024 15:12:19 GMT

_Version update only_

## 0.3.3
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.3.2
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.3.1
Thu, 29 Aug 2024 00:11:32 GMT

### Patches

- Fix description file resolution after cross-package import.

## 0.3.0
Wed, 28 Aug 2024 00:11:41 GMT

### Minor changes

- Expect the base path to be part of the resolver cache file.

## 0.2.0
Tue, 27 Aug 2024 15:12:33 GMT

### Minor changes

- Support hierarchical `node_modules` folders.

## 0.1.2
Mon, 26 Aug 2024 02:00:11 GMT

### Patches

- Fix bug caused by mutating resolver request object.

## 0.1.1
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.1.0
Fri, 16 Aug 2024 00:11:49 GMT

### Minor changes

- Add plugin for more efficient import resolution in a monorepo with known structure. Optimizes lookup of the relevant `package.json` for a given path, and lookup of npm dependencies of the containing package.

