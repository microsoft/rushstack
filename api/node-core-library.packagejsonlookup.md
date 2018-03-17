[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md)

# PackageJsonLookup class

This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(parameters)`](./node-core-library.packagejsonlookup.constructor.md) |  |  | Constructs a new instance of the [PackageJsonLookup](./node-core-library.packagejsonlookup.md) class |
|  [`clearCache()`](./node-core-library.packagejsonlookup.clearcache.md) |  | `void` | Clears the internal file cache. |
|  [`loadPackageJson(jsonFilename)`](./node-core-library.packagejsonlookup.loadpackagejson.md) |  | `IPackageJson` | Loads the specified package.json file, if it is not already present in the cache. |
|  [`tryGetPackageFolderFor(fileOrFolderPath)`](./node-core-library.packagejsonlookup.trygetpackagefolderfor.md) |  | `string | undefined` | Returns the absolute path of a folder containing a package.json file, by looking upwards from the specified fileOrFolderPath. If no package.json can be found, undefined is returned. |
|  [`tryGetPackageJsonFilePathFor(fileOrFolderPath)`](./node-core-library.packagejsonlookup.trygetpackagejsonfilepathfor.md) |  | `string | undefined` | If the specified file or folder is part of a package, this returns the absolute path to the associated package.json file. |
|  [`tryLoadPackageJsonFor(fileOrFolderPath)`](./node-core-library.packagejsonlookup.tryloadpackagejsonfor.md) |  | `IPackageJson | undefined` | If the specified file or folder is part of a package, this loads and returns the associated package.json file. |

