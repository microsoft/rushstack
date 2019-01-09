[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md)

## PackageJsonLookup class

This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached.

<b>Signature:</b>

```typescript
export declare class PackageJsonLookup 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[clearCache()](./node-core-library.packagejsonlookup.clearcache.md)</p> |  | <p>Clears the internal file cache.</p> |
|  <p>[loadOwnPackageJson(dirnameOfCaller)](./node-core-library.packagejsonlookup.loadownpackagejson.md)</p> | <p>`static`</p> | <p>A helper for loading the caller's own package.json file.</p> |
|  <p>[loadPackageJson(jsonFilename)](./node-core-library.packagejsonlookup.loadpackagejson.md)</p> |  | <p>Loads the specified package.json file, if it is not already present in the cache.</p> |
|  <p>[tryGetPackageFolderFor(fileOrFolderPath)](./node-core-library.packagejsonlookup.trygetpackagefolderfor.md)</p> |  | <p>Returns the absolute path of a folder containing a package.json file, by looking upwards from the specified fileOrFolderPath. If no package.json can be found, undefined is returned.</p> |
|  <p>[tryGetPackageJsonFilePathFor(fileOrFolderPath)](./node-core-library.packagejsonlookup.trygetpackagejsonfilepathfor.md)</p> |  | <p>If the specified file or folder is part of a package, this returns the absolute path to the associated package.json file.</p> |
|  <p>[tryLoadPackageJsonFor(fileOrFolderPath)](./node-core-library.packagejsonlookup.tryloadpackagejsonfor.md)</p> |  | <p>If the specified file or folder is part of a package, this loads and returns the associated package.json file.</p> |

