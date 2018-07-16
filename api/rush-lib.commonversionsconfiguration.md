[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [CommonVersionsConfiguration](./rush-lib.commonversionsconfiguration.md)

# CommonVersionsConfiguration class

Use this class to load and save the "common/config/rush/common-versions.json" config file. This config file stores dependency version information that affects all projects in the repo.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`allowedAlternativeVersions`](./rush-lib.commonversionsconfiguration.allowedalternativeversions.md) |  | `Map<string, ReadonlyArray<string>>` | A table that stores, for a given dependency, a list of SemVer ranges that will be accepted by "rush check" in addition to the normal version range. |
|  [`preferredVersions`](./rush-lib.commonversionsconfiguration.preferredversions.md) |  | `Map<string, string>` | A table that specifies a "preferred version" for a dependency package. |
|  [`xstitchPreferredVersions`](./rush-lib.commonversionsconfiguration.xstitchpreferredversions.md) |  | `Map<string, string>` | A table of specifies preferred versions maintained by the XStitch tool. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getAllPreferredVersions()`](./rush-lib.commonversionsconfiguration.getallpreferredversions.md) |  | `Map<string, string>` | Returns the union of preferredVersions and xstitchPreferredVersions. |
|  [`loadFromFile(jsonFilename)`](./rush-lib.commonversionsconfiguration.loadfromfile.md) |  | `CommonVersionsConfiguration` | Loads the common-versions.json data from the specified file path. If the file has not been created yet, then an empty object is returned. |
|  [`save()`](./rush-lib.commonversionsconfiguration.save.md) |  | `void` | Writes the "common-versions.json" file to disk, using the filename that was passed to loadFromFile(). |

