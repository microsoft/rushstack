[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md)

# PackageJsonLookup class

This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor()`](./node-core-library.packagejsonlookup.constructor.md) |  |  | Constructs a new instance of the [PackageJsonLookup](./node-core-library.packagejsonlookup.md) class |
|  [`clearCache()`](./node-core-library.packagejsonlookup.clearcache.md) |  | `void` | Clears the internal file cache. |
|  [`getPackageName(packageJsonPath)`](./node-core-library.packagejsonlookup.getpackagename.md) |  | `string` | Loads the package.json file and returns the name of the package. |
|  [`tryGetPackageFolder(sourceFilePath)`](./node-core-library.packagejsonlookup.trygetpackagefolder.md) |  | `string | undefined` | Finds the path to the package folder of a given currentPath, by probing upwards from the currentPath until a package.json file is found. If no package.json can be found, undefined is returned. |

