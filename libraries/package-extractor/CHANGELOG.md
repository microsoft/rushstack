# Change Log - @rushstack/package-extractor

This log was last generated on Wed, 06 Sep 2023 19:00:39 GMT and should not be manually modified.

## 0.5.2
Wed, 06 Sep 2023 19:00:39 GMT

### Patches

- Fix an issue where subdirectory inclusion patterns (ex. "src/subdir/**/*") would get ignored during extraction

## 0.5.1
Thu, 24 Aug 2023 15:20:46 GMT

_Version update only_

## 0.5.0
Wed, 23 Aug 2023 00:20:45 GMT

### Minor changes

- Add option field dependenciesConfigurations in PackageExtractor to filter files for third party dependencies

## 0.4.1
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.4.0
Fri, 04 Aug 2023 15:22:44 GMT

### Minor changes

- Include an API for getting files that are included in a npm package.

## 0.3.13
Mon, 31 Jul 2023 15:19:05 GMT

_Version update only_

## 0.3.12
Sat, 29 Jul 2023 00:22:51 GMT

_Version update only_

## 0.3.11
Thu, 20 Jul 2023 20:47:28 GMT

_Version update only_

## 0.3.10
Wed, 19 Jul 2023 00:20:31 GMT

_Version update only_

## 0.3.9
Fri, 14 Jul 2023 15:20:45 GMT

_Version update only_

## 0.3.8
Thu, 13 Jul 2023 00:22:37 GMT

_Version update only_

## 0.3.7
Wed, 12 Jul 2023 15:20:39 GMT

_Version update only_

## 0.3.6
Wed, 12 Jul 2023 00:23:29 GMT

_Version update only_

## 0.3.5
Fri, 07 Jul 2023 00:19:32 GMT

_Version update only_

## 0.3.4
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.3.3
Tue, 04 Jul 2023 00:18:47 GMT

_Version update only_

## 0.3.2
Mon, 26 Jun 2023 23:45:21 GMT

### Patches

- Fix patternsToInclude and patternsToExclude filters when provided patterns target subdirectories of folders that do not match the provided patterns

## 0.3.1
Mon, 19 Jun 2023 22:40:21 GMT

_Version update only_

## 0.3.0
Sat, 17 Jun 2023 00:21:54 GMT

### Minor changes

- Allow for include and exclude filters to be provided for projects. This allows for an additional layer of filtering when extracting a package.

## 0.2.18
Thu, 15 Jun 2023 00:21:02 GMT

_Version update only_

## 0.2.17
Wed, 14 Jun 2023 00:19:42 GMT

_Version update only_

## 0.2.16
Tue, 13 Jun 2023 15:17:20 GMT

_Version update only_

## 0.2.15
Tue, 13 Jun 2023 01:49:01 GMT

### Patches

- Bump webpack to v5.82.1

## 0.2.14
Fri, 09 Jun 2023 18:05:35 GMT

_Version update only_

## 0.2.13
Fri, 09 Jun 2023 15:23:15 GMT

_Version update only_

## 0.2.12
Fri, 09 Jun 2023 00:19:49 GMT

_Version update only_

## 0.2.11
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.2.10
Thu, 08 Jun 2023 00:20:02 GMT

_Version update only_

## 0.2.9
Wed, 07 Jun 2023 22:45:17 GMT

_Version update only_

## 0.2.8
Tue, 06 Jun 2023 02:52:51 GMT

_Version update only_

## 0.2.7
Mon, 05 Jun 2023 21:45:21 GMT

_Version update only_

## 0.2.6
Fri, 02 Jun 2023 02:01:12 GMT

_Version update only_

## 0.2.5
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.2.4
Mon, 22 May 2023 06:34:33 GMT

_Version update only_

## 0.2.3
Fri, 12 May 2023 00:23:05 GMT

_Version update only_

## 0.2.2
Fri, 05 May 2023 00:23:06 GMT

### Patches

- Export typings for the extractor-metadata.json file

## 0.2.1
Thu, 04 May 2023 00:20:28 GMT

_Version update only_

## 0.2.0
Wed, 03 May 2023 00:17:46 GMT

### Minor changes

- Bundle the `create-links` script to ensure any imports that are added in the future don't cause issues.

## 0.1.3
Mon, 01 May 2023 15:23:19 GMT

_Version update only_

## 0.1.2
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 0.1.1
Fri, 28 Apr 2023 19:36:47 GMT

### Patches

- Fix typings reference in package.json

## 0.1.0
Thu, 27 Apr 2023 17:18:42 GMT

### Minor changes

- Create new @rushstack/package-extractor package allowing for deployment of a target package and associated dependencies

