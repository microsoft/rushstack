# Change Log - @rushstack/heft-config-file

This log was last generated on Mon, 06 Dec 2021 16:08:33 GMT and should not be manually modified.

## 0.7.8
Mon, 06 Dec 2021 16:08:33 GMT

_Version update only_

## 0.7.7
Fri, 03 Dec 2021 03:05:22 GMT

_Version update only_

## 0.7.6
Sat, 06 Nov 2021 00:09:13 GMT

_Version update only_

## 0.7.5
Fri, 05 Nov 2021 15:09:18 GMT

_Version update only_

## 0.7.4
Wed, 27 Oct 2021 00:08:15 GMT

### Patches

- Update the package.json repository field to include the directory property.

## 0.7.3
Wed, 13 Oct 2021 15:09:54 GMT

_Version update only_

## 0.7.2
Fri, 08 Oct 2021 08:08:34 GMT

_Version update only_

## 0.7.1
Thu, 07 Oct 2021 07:13:35 GMT

_Version update only_

## 0.7.0
Tue, 05 Oct 2021 15:08:37 GMT

### Minor changes

- Use ITerminal instead of Terminal to allow for compatibility with other versions of @rushstack/node-core-library.

## 0.6.8
Fri, 24 Sep 2021 00:09:29 GMT

_Version update only_

## 0.6.7
Thu, 23 Sep 2021 00:10:40 GMT

### Patches

- Upgrade the `@types/node` dependency to version to version 12.

## 0.6.6
Tue, 14 Sep 2021 01:17:04 GMT

_Version update only_

## 0.6.5
Mon, 13 Sep 2021 15:07:06 GMT

_Version update only_

## 0.6.4
Wed, 08 Sep 2021 19:06:22 GMT

### Patches

- Fix issue with overwriting configuration properties using falsey values

## 0.6.3
Fri, 27 Aug 2021 00:07:25 GMT

_Version update only_

## 0.6.2
Wed, 11 Aug 2021 00:07:21 GMT

### Patches

- Move detailed logging from verbose to debug severity.

## 0.6.1
Mon, 12 Jul 2021 23:08:26 GMT

_Version update only_

## 0.6.0
Wed, 30 Jun 2021 01:37:17 GMT

### Minor changes

- Allow for specifying a custom resolver when resolving paths with heft-config-file. This change removes "preresolve" property for JsonPath module resolution options and replaces it with a more flexible "customResolver" property

## 0.5.0
Fri, 11 Jun 2021 00:34:02 GMT

### Minor changes

- Add "preresolve" property to transform paths before resolution

## 0.4.2
Fri, 04 Jun 2021 19:59:53 GMT

_Version update only_

## 0.4.1
Fri, 04 Jun 2021 00:08:34 GMT

### Patches

- Reduce the number of extra file system calls made when loading many config files.

## 0.4.0
Sat, 29 May 2021 01:05:06 GMT

### Minor changes

- Expose the ConfigurationFile.projectRelativeFilePath property

## 0.3.22
Wed, 19 May 2021 00:11:39 GMT

_Version update only_

## 0.3.21
Mon, 03 May 2021 15:10:29 GMT

_Version update only_

## 0.3.20
Mon, 12 Apr 2021 15:10:29 GMT

_Version update only_

## 0.3.19
Thu, 08 Apr 2021 20:41:54 GMT

### Patches

- Remove an outdated note from the README.

## 0.3.18
Tue, 06 Apr 2021 15:14:22 GMT

_Version update only_

## 0.3.17
Thu, 04 Mar 2021 01:11:31 GMT

_Version update only_

## 0.3.16
Fri, 05 Feb 2021 16:10:42 GMT

_Version update only_

## 0.3.15
Thu, 10 Dec 2020 23:25:49 GMT

_Version update only_

## 0.3.14
Tue, 17 Nov 2020 01:17:38 GMT

### Patches

- Fix an issue where .map files were not being published

## 0.3.13
Wed, 11 Nov 2020 01:08:59 GMT

_Version update only_

## 0.3.12
Tue, 10 Nov 2020 23:13:12 GMT

_Version update only_

## 0.3.11
Fri, 06 Nov 2020 16:09:30 GMT

### Patches

- Fix an issue where an error would be thrown if a value was omitted in a parent configuration file.

## 0.3.10
Fri, 30 Oct 2020 06:38:39 GMT

_Version update only_

## 0.3.9
Fri, 30 Oct 2020 00:10:14 GMT

_Version update only_

## 0.3.8
Wed, 28 Oct 2020 01:18:03 GMT

_Version update only_

## 0.3.7
Tue, 27 Oct 2020 15:10:13 GMT

_Version update only_

## 0.3.6
Thu, 15 Oct 2020 00:59:08 GMT

_Version update only_

## 0.3.5
Tue, 06 Oct 2020 00:24:06 GMT

_Version update only_

## 0.3.4
Mon, 05 Oct 2020 22:36:57 GMT

_Version update only_

## 0.3.3
Mon, 05 Oct 2020 15:10:43 GMT

_Version update only_

## 0.3.2
Thu, 01 Oct 2020 20:27:16 GMT

_Version update only_

## 0.3.1
Wed, 30 Sep 2020 18:39:17 GMT

### Patches

- Update to build with @rushstack/heft-node-rig

## 0.3.0
Wed, 30 Sep 2020 06:53:53 GMT

### Minor changes

- (BREAKING CHANGE) Remove "propertyInheritanceTypes" option in favor of a more flexible "propertyInheritance" that allows for custom inheritance.
- (BREAKING CHANGE) Change the ConfigurationFile API to take the project-relative configuration file in the constructor. Now the configuration file loading function takes the project root instead of the configuration file path.
- Add an API to "try" to load a configuration file, and return undefined if it doesn't exist instead of throwing an exception.
- Add support for config/rig.json.
- Upgrade compiler; the API now requires TypeScript 3.9 or newer

### Patches

- Update README.md

## 0.2.7
Tue, 22 Sep 2020 05:45:57 GMT

_Version update only_

## 0.2.6
Tue, 22 Sep 2020 01:45:31 GMT

_Version update only_

## 0.2.5
Tue, 22 Sep 2020 00:08:53 GMT

_Version update only_

## 0.2.4
Sat, 19 Sep 2020 04:37:27 GMT

_Version update only_

## 0.2.3
Sat, 19 Sep 2020 03:33:07 GMT

_Version update only_

## 0.2.2
Fri, 18 Sep 2020 22:57:24 GMT

_Version update only_

## 0.2.1
Fri, 18 Sep 2020 21:49:53 GMT

### Patches

- Allow "extends" fields to refer to modules in addition to relative paths.

## 0.2.0
Sun, 13 Sep 2020 01:53:20 GMT

### Minor changes

- (BREAKING CHANGE) Change the API to require the JSON schema path to be passed via the ConfigurationFile constructor options object.

## 0.1.3
Fri, 11 Sep 2020 02:13:35 GMT

_Version update only_

## 0.1.2
Mon, 07 Sep 2020 07:37:37 GMT

_Version update only_

## 0.1.1
Sat, 05 Sep 2020 18:56:35 GMT

_Version update only_

## 0.1.0
Thu, 27 Aug 2020 11:27:06 GMT

### Minor changes

- Initial project creation.

