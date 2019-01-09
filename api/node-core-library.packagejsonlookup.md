[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md)

## PackageJsonLookup class

This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached.

<b>Signature:</b>

```typescript
export declare class PackageJsonLookup 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [clearCache()](./node-core-library.packagejsonlookup.clearcache.md) |  | Clears the internal file cache. |
|  [loadOwnPackageJson(dirnameOfCaller)](./node-core-library.packagejsonlookup.loadownpackagejson.md) | `static` | A helper for loading the caller's own package.json file. |
|  [loadPackageJson(jsonFilename)](./node-core-library.packagejsonlookup.loadpackagejson.md) |  | Loads the specified package.json file, if it is not already present in the cache. |
|  [tryGetPackageFolderFor(fileOrFolderPath)](./node-core-library.packagejsonlookup.trygetpackagefolderfor.md) |  | Returns the absolute path of a folder containing a package.json file, by looking upwards from the specified fileOrFolderPath. If no package.json can be found, undefined is returned. |
|  [tryGetPackageJsonFilePathFor(fileOrFolderPath)](./node-core-library.packagejsonlookup.trygetpackagejsonfilepathfor.md) |  | If the specified file or folder is part of a package, this returns the absolute path to the associated package.json file. |
|  [tryLoadPackageJsonFor(fileOrFolderPath)](./node-core-library.packagejsonlookup.tryloadpackagejsonfor.md) |  | If the specified file or folder is part of a package, this loads and returns the associated package.json file. |

