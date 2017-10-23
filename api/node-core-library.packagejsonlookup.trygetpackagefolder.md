[Home](./index) &gt; [@microsoft/node-core-library](node-core-library.md) &gt; [PackageJsonLookup](node-core-library.packagejsonlookup.md) &gt; [tryGetPackageFolder](node-core-library.packagejsonlookup.trygetpackagefolder.md)

# PackageJsonLookup.tryGetPackageFolder method

Finds the path to the package folder of a given currentPath, by probing upwards from the currentPath until a package.json file is found. If no package.json can be found, undefined is returned.

**Signature:**
```javascript
public tryGetPackageFolder(sourceFilePath: string): string | undefined;
```
**Returns:** `string | undefined`

a relative path to the package folder

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `sourceFilePath` | `string` |  |

