<!-- docId=node-core-library.packagejsonlookup -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md)

# PackageJsonLookup class

This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached.

## Constructor

Constructs a new instance of the `PackageJsonLookup` class

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clearCache()`](./node-core-library.packagejsonlookup.clearcache.md) | `public` | `void` | Clears the internal file cache. |
|  [`getPackageName(packageJsonPath)`](./node-core-library.packagejsonlookup.getpackagename.md) | `public` | `string` | Loads the package.json file and returns the name of the package. |
|  [`tryGetPackageFolder(currentPath)`](./node-core-library.packagejsonlookup.trygetpackagefolder.md) | `public` | `string | undefined` | Finds the path to the package folder of a given currentPath, by probing upwards from the currentPath until a package.json file is found. If no package.json can be found, undefined is returned. |

