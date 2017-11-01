[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [PinnedVersionsConfiguration](rush-lib.pinnedversionsconfiguration.md)

# PinnedVersionsConfiguration class

Pinned Versions is a Rush feature designed to mimic the behavior of NPM when performing an install. Essentially, for a project, NPM installs all of the first level dependencies before starting any second-level dependencies. This means that you can control the specific version of a second-level dependency by promoting it to a 1st level dependency and using a version number that would satisfy. However, since rush uses the /common/package.json file, NPM treats each rush project as a top-level dependency, and treats the actual 1st level dependencies as second order. This means you could have cases where there is unnecessary inversion and side-by-side versioning in your shrinkwrap file. To mitigate this issue, we promote some dependencies and list them directly in the /common/package.json, ensuring that the selected version will be installed first and at the root.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`size`](rush-lib.pinnedversionsconfiguration.size.md) |  | `number` |  |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](rush-lib.pinnedversionsconfiguration.clear.md) | `public` | `this` |  |
|  [`delete(dependency)`](rush-lib.pinnedversionsconfiguration.delete.md) | `public` | `boolean` |  |
|  [`forEach(cb)`](rush-lib.pinnedversionsconfiguration.foreach.md) | `public` | `this` |  |
|  [`get(dependency)`](rush-lib.pinnedversionsconfiguration.get.md) | `public` | `string | undefined` |  |
|  [`has(dependency)`](rush-lib.pinnedversionsconfiguration.has.md) | `public` | `boolean` |  |
|  [`save()`](rush-lib.pinnedversionsconfiguration.save.md) | `public` | `this` |  |
|  [`set(dependency, version)`](rush-lib.pinnedversionsconfiguration.set.md) | `public` | `this` | Set a pinned version. Checks that the version is a valid semver. |
|  [`tryLoadFromFile(jsonFilename)`](rush-lib.pinnedversionsconfiguration.tryloadfromfile.md) | `public` | `PinnedVersionsConfiguration` | Attempts to load pinned versions configuration from a given file |

