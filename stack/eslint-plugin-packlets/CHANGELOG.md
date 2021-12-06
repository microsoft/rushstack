# Change Log - @rushstack/eslint-plugin-packlets

This log was last generated on Mon, 06 Dec 2021 16:08:32 GMT and should not be manually modified.

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

