# Change Log - @rushstack/webpack-workspace-resolve-plugin

This log was last generated on Mon, 26 Aug 2024 02:00:11 GMT and should not be manually modified.

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

