[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [PackageJsonEditor](./rush-lib.packagejsoneditor.md)

# PackageJsonEditor class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`dependencyList`](./rush-lib.packagejsoneditor.dependencylist.md) |  | `ReadonlyArray<PackageJsonDependency>` |  |
|  [`devDependencyList`](./rush-lib.packagejsoneditor.devdependencylist.md) |  | `ReadonlyArray<PackageJsonDependency>` |  |
|  [`filePath`](./rush-lib.packagejsoneditor.filepath.md) |  | `string` |  |
|  [`name`](./rush-lib.packagejsoneditor.name.md) |  | `string` |  |
|  [`version`](./rush-lib.packagejsoneditor.version.md) |  | `string` |  |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addOrUpdateDependency(packageName, newVersion, dependencyType)`](./rush-lib.packagejsoneditor.addorupdatedependency.md) |  | `void` |  |
|  [`fromObject(object, filename)`](./rush-lib.packagejsoneditor.fromobject.md) |  | `PackageJsonEditor` |  |
|  [`load(filePath)`](./rush-lib.packagejsoneditor.load.md) |  | `PackageJsonEditor` |  |
|  [`saveIfModified()`](./rush-lib.packagejsoneditor.saveifmodified.md) |  | `boolean` |  |
|  [`tryGetDependency(packageName)`](./rush-lib.packagejsoneditor.trygetdependency.md) |  | `PackageJsonDependency | undefined` |  |
|  [`tryGetDevDependency(packageName)`](./rush-lib.packagejsoneditor.trygetdevdependency.md) |  | `PackageJsonDependency | undefined` |  |

