# Change Log - @rushstack/eslint-plugin-packlets

This log was last generated on Wed, 11 Nov 2020 01:08:58 GMT and should not be manually modified.

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

