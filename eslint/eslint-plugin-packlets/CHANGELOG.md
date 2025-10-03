# Change Log - @rushstack/eslint-plugin-packlets

This log was last generated on Fri, 03 Oct 2025 20:09:59 GMT and should not be manually modified.

## 0.13.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.

## 0.12.0
Thu, 26 Jun 2025 18:57:04 GMT

### Minor changes

- Update for compatibility with ESLint 9

## 0.11.0
Tue, 11 Mar 2025 02:12:33 GMT

### Minor changes

- Bump the `@typescript-eslint/*` packages to add support for TypeScript 5.8.

## 0.10.0
Sat, 01 Mar 2025 07:23:16 GMT

### Minor changes

- Bump the `@typescript-eslint/*` dependencies to `~8.24.0` to support newer versions of TypeScript.

## 0.9.2
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.9.1
Sat, 17 Feb 2024 06:24:34 GMT

_Version update only_

## 0.9.0
Tue, 16 Jan 2024 18:30:10 GMT

### Minor changes

- Add support for TypeScript 5.3 with @typescript-eslint 6.19.x

## 0.8.1
Tue, 26 Sep 2023 09:30:33 GMT

_Version update only_

## 0.8.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 0.7.0
Mon, 22 May 2023 06:34:32 GMT

### Minor changes

- Upgrade the @typescript-eslint/* dependencies to ~5.59.2

## 0.6.1
Mon, 10 Oct 2022 15:23:44 GMT

### Patches

- Fix a link in the README.

## 0.6.0
Thu, 29 Sep 2022 07:13:06 GMT

### Minor changes

- Upgraded @typescript-eslint dependencies to 5.30.x to enable support for TypeScript 4.8

## 0.5.0
Wed, 03 Aug 2022 18:40:35 GMT

### Minor changes

- Upgrade TypeScript dependency to 4.7

## 0.4.1
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 0.4.0
Sat, 23 Apr 2022 02:13:06 GMT

### Minor changes

- Add support for TypeScript 4.6

## 0.3.6
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 0.3.5
Tue, 15 Mar 2022 19:15:53 GMT

### Patches

- Fix the path in the package.json "directory" field.

## 0.3.4
Mon, 06 Dec 2021 16:08:32 GMT

### Patches

- Add support for ESLint v8

## 0.3.3
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 0.3.2
Thu, 07 Oct 2021 07:13:35 GMT

### Patches

- Update typescript-eslint to add support for TypeScript 4.4.

## 0.3.1
Thu, 23 Sep 2021 00:10:40 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 0.3.0
Mon, 12 Jul 2021 23:08:26 GMT

### Minor changes

- Upgrade @typescript-eslint/* packages to 4.28.0 (GitHub #2389)

## 0.2.2
Mon, 12 Apr 2021 15:10:28 GMT

### Patches

- Fix an issue where the @rushstack/packlets/circular-deps rule did not work correctly with TypeScript 4.2

## 0.2.1
Tue, 06 Apr 2021 15:14:22 GMT

### Patches

- Fix unlisted dependency on @typescript-eslint/experimental-utils

## 0.2.0
Wed, 11 Nov 2020 01:08:58 GMT

### Minor changes

- Add an optional "@rushstack/packlets/readme" rule that requires a README.md in each packlet folder

## 0.1.2
Wed, 28 Oct 2020 01:18:03 GMT

### Patches

- Fix an exception that occured if a source file was added to the "src/packlets" folder, not belonging to any packlet
- Fix an issue where linting was sometimes not performed on MacOS, because Node.js "path.relative()" incorrectly assumes that every POSIX file system is case-sensitive
- Fix an issue where @rushstack/packlets/circular-deps did not detect certain types of circular dependencies

## 0.1.1
Tue, 06 Oct 2020 00:24:06 GMT

### Patches

- Fix broken link to tutorial project in README.md

## 0.1.0
Mon, 05 Oct 2020 22:36:57 GMT

### Minor changes

- Initial release

