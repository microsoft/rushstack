[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md) &gt; [getPackageName](./node-core-library.packagejsonlookup.getpackagename.md)

# PackageJsonLookup.getPackageName method

Loads the package.json file and returns the name of the package.

**Signature:**
```javascript
getPackageName(packageJsonPath: string): string;
```
**Returns:** `string`

the name of the package (E.g. @microsoft/api-extractor)

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `packageJsonPath` | `string` | an absolute path to the folder containing the package.json file, it does not include the 'package.json' suffix. |

