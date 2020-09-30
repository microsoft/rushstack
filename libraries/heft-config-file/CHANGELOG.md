# Change Log - @rushstack/heft-config-file

This log was last generated on Wed, 30 Sep 2020 18:39:17 GMT and should not be manually modified.

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

