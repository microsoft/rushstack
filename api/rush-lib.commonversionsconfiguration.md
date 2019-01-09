[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [CommonVersionsConfiguration](./rush-lib.commonversionsconfiguration.md)

## CommonVersionsConfiguration class

Use this class to load and save the "common/config/rush/common-versions.json" config file. This config file stores dependency version information that affects all projects in the repo.

<b>Signature:</b>

```typescript
export declare class CommonVersionsConfiguration 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[allowedAlternativeVersions](./rush-lib.commonversionsconfiguration.allowedalternativeversions.md)</p> |  | <p>`Map<string, ReadonlyArray<string>>`</p> | <p>A table that stores, for a given dependency, a list of SemVer ranges that will be accepted by "rush check" in addition to the normal version range.</p> |
|  <p>[filePath](./rush-lib.commonversionsconfiguration.filepath.md)</p> |  | <p>`string`</p> | <p>Get the absolute file path of the common-versions.json file.</p> |
|  <p>[preferredVersions](./rush-lib.commonversionsconfiguration.preferredversions.md)</p> |  | <p>`Map<string, string>`</p> | <p>A table that specifies a "preferred version" for a dependency package.</p> |
|  <p>[xstitchPreferredVersions](./rush-lib.commonversionsconfiguration.xstitchpreferredversions.md)</p> |  | <p>`Map<string, string>`</p> | <p>A table of specifies preferred versions maintained by the XStitch tool.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getAllPreferredVersions()](./rush-lib.commonversionsconfiguration.getallpreferredversions.md)</p> |  | <p>Returns the union of preferredVersions and xstitchPreferredVersions.</p> |
|  <p>[loadFromFile(jsonFilename)](./rush-lib.commonversionsconfiguration.loadfromfile.md)</p> | <p>`static`</p> | <p>Loads the common-versions.json data from the specified file path. If the file has not been created yet, then an empty object is returned.</p> |
|  <p>[save()](./rush-lib.commonversionsconfiguration.save.md)</p> |  | <p>Writes the "common-versions.json" file to disk, using the filename that was passed to loadFromFile().</p> |

