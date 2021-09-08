# Change Log - @rushstack/heft-jest-plugin

This log was last generated on Wed, 08 Sep 2021 00:08:03 GMT and should not be manually modified.

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

