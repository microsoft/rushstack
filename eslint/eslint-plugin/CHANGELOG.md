# Change Log - @rushstack/eslint-plugin

This log was last generated on Fri, 03 Oct 2025 20:09:59 GMT and should not be manually modified.

## 0.20.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 0.19.0
Thu, 26 Jun 2025 18:57:04 GMT

### Minor changes

- Update for compatibility with ESLint 9

## 0.18.0
Tue, 11 Mar 2025 02:12:33 GMT

### Minor changes

- Bump the `@typescript-eslint/*` packages to add support for TypeScript 5.8.

## 0.17.0
Sat, 01 Mar 2025 07:23:16 GMT

### Minor changes

- Bump the `@typescript-eslint/*` dependencies to `~8.24.0` to support newer versions of TypeScript.

## 0.16.1
Thu, 19 Sep 2024 00:11:08 GMT

### Patches

- Fix ESLint broken links

## 0.16.0
Wed, 14 Aug 2024 22:37:32 GMT

### Minor changes

- Add 4 new ESLint rules: "@rushstack/no-backslash-imports", used to prevent backslashes in import and require statements; "@rushstack/no-external-local-imports", used to prevent referencing external depedencies in import and require statements; "@rushstack/no-transitive-dependency-imports", used to prevent referencing transitive dependencies (ie. dependencies of dependencies) in import and require statements; and "@rushstack/normalized-imports", used to ensure that the most direct path to a dependency is provided in import and require statements

## 0.15.2
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.15.1
Sat, 17 Feb 2024 06:24:34 GMT

### Patches

- Fix broken link to API documentation

## 0.15.0
Wed, 07 Feb 2024 01:11:18 GMT

### Minor changes

- Allow using `as const` in `typedef-var`

## 0.14.0
Tue, 16 Jan 2024 18:30:10 GMT

### Minor changes

- Add support for TypeScript 5.3 with @typescript-eslint 6.19.x

## 0.13.1
Tue, 26 Sep 2023 09:30:33 GMT

_Version update only_

## 0.13.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 0.12.0
Mon, 22 May 2023 06:34:32 GMT

### Minor changes

- Upgrade the @typescript-eslint/* dependencies to ~5.59.2

## 0.11.0
Thu, 29 Sep 2022 07:13:06 GMT

### Minor changes

- Upgraded @typescript-eslint dependencies to 5.30.x to enable support for TypeScript 4.8

## 0.10.0
Wed, 03 Aug 2022 18:40:35 GMT

### Minor changes

- Upgrade TypeScript dependency to 4.7

## 0.9.1
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 0.9.0
Sat, 23 Apr 2022 02:13:06 GMT

### Minor changes

- Add support for TypeScript 4.6

## 0.8.6
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 0.8.5
Tue, 15 Mar 2022 19:15:53 GMT

### Patches

- Fix the path in the package.json "directory" field.

## 0.8.4
Mon, 06 Dec 2021 16:08:32 GMT

### Patches

- Add support for ESLint v8

## 0.8.3
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 0.8.2
Thu, 07 Oct 2021 07:13:35 GMT

### Patches

- Update typescript-eslint to add support for TypeScript 4.4.

## 0.8.1
Thu, 23 Sep 2021 00:10:40 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 0.8.0
Mon, 12 Jul 2021 23:08:26 GMT

### Minor changes

- Upgrade @typescript-eslint/* packages to 4.28.0 (GitHub #2389)

## 0.7.3
Tue, 06 Apr 2021 15:14:22 GMT

### Patches

- Fix unlisted dependency on @typescript-eslint/experimental-utils

## 0.7.2
Wed, 30 Sep 2020 18:39:17 GMT

### Patches

- Update to build with @rushstack/heft-node-rig

## 0.7.1
Wed, 30 Sep 2020 06:53:53 GMT

### Patches

- Include missing "License" field.
- Update README.md

## 0.7.0
Tue, 22 Sep 2020 01:45:31 GMT

### Minor changes

- Add a new rule "@rushstack/typedef-var" which supplements "@typescript-eslint/typedef" by enabling a special policy for local variables

## 0.6.3
Sat, 19 Sep 2020 04:37:26 GMT

### Patches

- Add missing dependency

## 0.6.2
Sat, 19 Sep 2020 03:33:06 GMT

### Patches

- Extract the pattern matcher into the new "@rushstack/tree-pattern" package

## 0.6.1
Thu, 27 Aug 2020 11:27:06 GMT

### Patches

- Revise the "@rushstack/hoist-jest-mock" rule to allow some common Jest coding practices that are not problematic

## 0.6.0
Mon, 24 Aug 2020 07:35:20 GMT

### Minor changes

- Add new rule @rushstack/hoist-jest-mock

## 0.5.0
Sat, 22 Aug 2020 05:55:42 GMT

### Minor changes

- Add a new rule "@rushstack/no-new-null" that will replace "@rushstack/no-null"

## 0.4.2
Wed, 12 Aug 2020 00:10:05 GMT

### Patches

- Updated project to build with Heft

## 0.4.1
Wed, 24 Jun 2020 09:50:48 GMT

### Patches

- Fix an issue with the published file set

## 0.4.0
Wed, 24 Jun 2020 09:04:28 GMT

### Minor changes

- Upgrade to ESLint 7

## 0.3.2
Wed, 18 Mar 2020 15:07:47 GMT

### Patches

- Upgrade cyclic dependencies

## 0.3.1
Sun, 19 Jan 2020 02:26:53 GMT

### Patches

- Upgrade Node typings to Node 10

## 0.3.0
Fri, 17 Jan 2020 01:08:23 GMT

### Minor changes

- Allow null in == and != conditionals for no-null eslint rule

## 0.2.0
Thu, 09 Jan 2020 06:44:12 GMT

### Minor changes

- Add new rule `@rushstack/no-untyped-underscore`

## 0.1.0
Wed, 08 Jan 2020 00:11:31 GMT

### Minor changes

- Initial release

