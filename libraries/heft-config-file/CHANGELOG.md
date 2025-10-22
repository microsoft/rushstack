# Change Log - @rushstack/heft-config-file

This log was last generated on Wed, 22 Oct 2025 00:57:54 GMT and should not be manually modified.

## 0.19.2
Wed, 22 Oct 2025 00:57:54 GMT

_Version update only_

## 0.19.1
Wed, 08 Oct 2025 00:13:29 GMT

_Version update only_

## 0.19.0
Fri, 03 Oct 2025 20:09:59 GMT

### Minor changes

- Normalize import of builtin modules to use the `node:` protocol.
- Add the ability to get the original value of the `$schema` property.

## 0.18.6
Tue, 30 Sep 2025 23:57:45 GMT

_Version update only_

## 0.18.5
Tue, 30 Sep 2025 20:33:51 GMT

_Version update only_

## 0.18.4
Thu, 11 Sep 2025 00:22:31 GMT

_Version update only_

## 0.18.3
Wed, 23 Jul 2025 20:55:57 GMT

_Version update only_

## 0.18.2
Thu, 01 May 2025 00:11:12 GMT

_Version update only_

## 0.18.1
Fri, 25 Apr 2025 00:11:32 GMT

### Patches

- Fix Node 16 compatibility by using non-built-in structuredClone

## 0.18.0
Thu, 17 Apr 2025 00:11:21 GMT

### Minor changes

- Allow use of the value `null` to discard any value set for the property from a parent config file..

## 0.17.0
Wed, 09 Apr 2025 00:11:02 GMT

### Minor changes

- Fix an issue with `PathResolutionMethod.resolvePathRelativeToProjectRoot` when extending files across packages.
- Add a new `customValidationFunction` option for custom validation logic on loaded configuration files.

## 0.16.8
Tue, 25 Mar 2025 15:11:15 GMT

_Version update only_

## 0.16.7
Tue, 11 Mar 2025 02:12:33 GMT

_Version update only_

## 0.16.6
Wed, 19 Feb 2025 18:53:48 GMT

### Patches

- Bump `jsonpath-plus` to `~10.3.0`.

## 0.16.5
Wed, 12 Feb 2025 01:10:52 GMT

_Version update only_

## 0.16.4
Thu, 30 Jan 2025 01:11:42 GMT

_Version update only_

## 0.16.3
Thu, 09 Jan 2025 01:10:10 GMT

_Version update only_

## 0.16.2
Sat, 14 Dec 2024 01:11:07 GMT

_Version update only_

## 0.16.1
Mon, 09 Dec 2024 20:31:43 GMT

### Patches

- Bump `jsonpath-plus` to `~10.2.0`.

## 0.16.0
Tue, 03 Dec 2024 16:11:07 GMT

### Minor changes

- Add a new `NonProjectConfigurationFile` class that is designed to load absolute-pathed configuration files without rig support.
- Rename `ConfigurationFile` to `ProjectConfigurationFile` and mark `ConfigurationFile` as `@deprecated`.

## 0.15.9
Fri, 22 Nov 2024 01:10:43 GMT

_Version update only_

## 0.15.8
Thu, 24 Oct 2024 00:15:47 GMT

### Patches

- Update the `jsonpath-plus` dependency to mitigate CVE-2024-21534."

## 0.15.7
Fri, 13 Sep 2024 00:11:43 GMT

_Version update only_

## 0.15.6
Tue, 10 Sep 2024 20:08:11 GMT

_Version update only_

## 0.15.5
Wed, 21 Aug 2024 05:43:04 GMT

_Version update only_

## 0.15.4
Mon, 12 Aug 2024 22:16:04 GMT

_Version update only_

## 0.15.3
Sat, 27 Jul 2024 00:10:27 GMT

### Patches

- Include CHANGELOG.md in published releases again

## 0.15.2
Wed, 17 Jul 2024 06:55:10 GMT

_Version update only_

## 0.15.1
Tue, 16 Jul 2024 00:36:22 GMT

_Version update only_

## 0.15.0
Thu, 27 Jun 2024 21:01:36 GMT

### Minor changes

- Add `ConfigurationFile.loadConfigurationFileForProject` and `ConfigurationFile.tryLoadConfigurationFileForProject` APIs to allow for synchronously loading Heft configuration files

## 0.14.25
Thu, 30 May 2024 00:13:05 GMT

### Patches

- Include missing `type` modifiers on type-only exports.

## 0.14.24
Wed, 29 May 2024 02:03:51 GMT

_Version update only_

## 0.14.23
Tue, 28 May 2024 15:10:09 GMT

_Version update only_

## 0.14.22
Tue, 28 May 2024 00:09:47 GMT

_Version update only_

## 0.14.21
Sat, 25 May 2024 04:54:08 GMT

_Version update only_

## 0.14.20
Thu, 23 May 2024 02:26:56 GMT

_Version update only_

## 0.14.19
Wed, 15 May 2024 23:42:58 GMT

_Version update only_

## 0.14.18
Wed, 15 May 2024 06:04:17 GMT

_Version update only_

## 0.14.17
Fri, 10 May 2024 05:33:34 GMT

_Version update only_

## 0.14.16
Mon, 06 May 2024 15:11:05 GMT

_Version update only_

## 0.14.15
Wed, 10 Apr 2024 15:10:08 GMT

_Version update only_

## 0.14.14
Sat, 24 Feb 2024 23:02:51 GMT

_Version update only_

## 0.14.13
Wed, 21 Feb 2024 21:45:28 GMT

_Version update only_

## 0.14.12
Tue, 20 Feb 2024 21:45:10 GMT

_Version update only_

## 0.14.11
Mon, 19 Feb 2024 21:54:26 GMT

_Version update only_

## 0.14.10
Sat, 17 Feb 2024 06:24:34 GMT

### Patches

- Fix broken link to API documentation

## 0.14.9
Thu, 08 Feb 2024 01:09:22 GMT

_Version update only_

## 0.14.8
Mon, 05 Feb 2024 23:46:52 GMT

_Version update only_

## 0.14.7
Thu, 25 Jan 2024 01:09:30 GMT

_Version update only_

## 0.14.6
Tue, 23 Jan 2024 20:12:58 GMT

_Version update only_

## 0.14.5
Tue, 23 Jan 2024 16:15:05 GMT

_Version update only_

## 0.14.4
Wed, 03 Jan 2024 00:31:18 GMT

_Version update only_

## 0.14.3
Thu, 07 Dec 2023 03:44:13 GMT

_Version update only_

## 0.14.2
Thu, 28 Sep 2023 20:53:17 GMT

_Version update only_

## 0.14.1
Tue, 26 Sep 2023 09:30:33 GMT

### Patches

- Update type-only imports to include the type modifier.

## 0.14.0
Fri, 15 Sep 2023 00:36:58 GMT

### Minor changes

- Update @types/node from 14 to 18

## 0.13.3
Tue, 08 Aug 2023 07:10:40 GMT

_Version update only_

## 0.13.2
Wed, 19 Jul 2023 00:20:32 GMT

_Version update only_

## 0.13.1
Thu, 06 Jul 2023 00:16:20 GMT

_Version update only_

## 0.13.0
Mon, 19 Jun 2023 22:40:21 GMT

### Minor changes

-  Use the `IRigConfig` interface insteacd of the `RigConfig` class in the API.

## 0.12.5
Thu, 15 Jun 2023 00:21:01 GMT

_Version update only_

## 0.12.4
Wed, 07 Jun 2023 22:45:16 GMT

_Version update only_

## 0.12.3
Mon, 29 May 2023 15:21:15 GMT

_Version update only_

## 0.12.2
Mon, 22 May 2023 06:34:32 GMT

_Version update only_

## 0.12.1
Fri, 12 May 2023 00:23:06 GMT

_Version update only_

## 0.12.0
Mon, 01 May 2023 15:23:19 GMT

### Minor changes

- BREAKING CHANGE: The custom resolver method now accepts an options parameter. This parameter includes all previously provided information and now includes the partially-resolved configuration file.

## 0.11.11
Sat, 29 Apr 2023 00:23:03 GMT

_Version update only_

## 0.11.10
Thu, 27 Apr 2023 17:18:43 GMT

_Version update only_

## 0.11.9
Fri, 10 Feb 2023 01:18:51 GMT

_Version update only_

## 0.11.8
Sun, 05 Feb 2023 03:02:02 GMT

_Version update only_

## 0.11.7
Wed, 01 Feb 2023 02:16:34 GMT

_Version update only_

## 0.11.6
Mon, 30 Jan 2023 16:22:30 GMT

_Version update only_

## 0.11.5
Thu, 26 Jan 2023 02:55:09 GMT

### Patches

- Upgrade to webpack 5.75.0

## 0.11.4
Fri, 09 Dec 2022 16:18:28 GMT

_Version update only_

## 0.11.3
Thu, 13 Oct 2022 00:20:15 GMT

_Version update only_

## 0.11.2
Mon, 10 Oct 2022 15:23:44 GMT

_Version update only_

## 0.11.1
Thu, 29 Sep 2022 07:13:06 GMT

_Version update only_

## 0.11.0
Tue, 27 Sep 2022 22:17:20 GMT

### Minor changes

- Allow a schema object to be passed to the ConfigurationFile constructor instead of the path to a schema file.

## 0.10.0
Wed, 21 Sep 2022 20:21:10 GMT

### Minor changes

- Add a "propertyInheritanceDefaults" option that allows the default property inheritance type to be configured.

## 0.9.6
Thu, 15 Sep 2022 00:18:52 GMT

_Version update only_

## 0.9.5
Wed, 24 Aug 2022 03:01:22 GMT

_Version update only_

## 0.9.4
Wed, 24 Aug 2022 00:14:38 GMT

_Version update only_

## 0.9.3
Fri, 19 Aug 2022 00:17:19 GMT

_Version update only_

## 0.9.2
Wed, 03 Aug 2022 18:40:35 GMT

_Version update only_

## 0.9.1
Mon, 01 Aug 2022 02:45:32 GMT

_Version update only_

## 0.9.0
Wed, 13 Jul 2022 21:31:13 GMT

### Minor changes

- (BREAKING API CHANGE) Deprecate `PathResolutionMethod.NodeResolve` in favor of `PathResolutionMethod.nodeResolve`.

### Patches

- Improve types strictness of `IJsonPathsMetadata`

## 0.8.10
Tue, 28 Jun 2022 22:47:13 GMT

_Version update only_

## 0.8.9
Tue, 28 Jun 2022 00:23:32 GMT

_Version update only_

## 0.8.8
Mon, 27 Jun 2022 18:43:09 GMT

_Version update only_

## 0.8.7
Sat, 25 Jun 2022 01:54:29 GMT

_Version update only_

## 0.8.6
Fri, 17 Jun 2022 09:17:54 GMT

_Version update only_

## 0.8.5
Fri, 17 Jun 2022 00:16:18 GMT

_Version update only_

## 0.8.4
Tue, 10 May 2022 01:20:43 GMT

_Version update only_

## 0.8.3
Sat, 23 Apr 2022 02:13:07 GMT

_Version update only_

## 0.8.2
Fri, 15 Apr 2022 00:12:36 GMT

_Version update only_

## 0.8.1
Sat, 09 Apr 2022 02:24:26 GMT

### Patches

- Rename the "master" branch to "main".

## 0.8.0
Sat, 19 Mar 2022 08:05:37 GMT

### Minor changes

- Add support for an inline "$<propertyName>.inheritanceType" property. This feature allows for configuration files to specify how object and array properties are inherited, overriding the default inheritance behavior provided by the configuration file class.

## 0.7.12
Tue, 15 Mar 2022 19:15:53 GMT

_Version update only_

## 0.7.11
Wed, 05 Jan 2022 16:07:47 GMT

_Version update only_

## 0.7.10
Mon, 27 Dec 2021 16:10:40 GMT

_Version update only_

## 0.7.9
Thu, 09 Dec 2021 20:34:41 GMT

_Version update only_

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

