# Change Log - @rushstack/webpack-workspace-resolve-plugin

This log was last generated on Thu, 29 Aug 2024 00:11:32 GMT and should not be manually modified.

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

