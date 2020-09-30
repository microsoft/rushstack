# Change Log - @rushstack/rig-package

This log was last generated on Wed, 30 Sep 2020 18:39:17 GMT and should not be manually modified.

## 0.2.1
Wed, 30 Sep 2020 18:39:17 GMT

### Patches

- Update to build with @rushstack/heft-node-rig

## 0.2.0
Wed, 30 Sep 2020 06:53:53 GMT

### Minor changes

- Update the rig package guidance to place tool configuration files that would normally be in a "config" folder in a "config" folder inside the rig package as well.
- Add ILoadForProjectFolderOptions.overrideRigJsonObject
- Add RigConfig.tryResolveConfigFilePath()
- Upgrade compiler; the API now requires TypeScript 3.9 or newer

### Patches

- Report an error if the specified "rigProfile" is not defined by the rig package
- Update README.md

## 0.1.0
Fri, 25 Sep 2020 08:13:01 GMT

### Minor changes

- Initial release

