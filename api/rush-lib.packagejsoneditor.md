[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [PackageJsonEditor](./rush-lib.packagejsoneditor.md)

## PackageJsonEditor class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 


<b>Signature:</b>

```typescript
export declare class PackageJsonEditor 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[dependencyList](./rush-lib.packagejsoneditor.dependencylist.md)</p> |  | <p>`ReadonlyArray<PackageJsonDependency>`</p> | <p><b><i>(BETA)</i></b> The list of dependencies of type DependencyType.Regular, DependencyType.Optional, or DependencyType.Peer.</p> |
|  <p>[devDependencyList](./rush-lib.packagejsoneditor.devdependencylist.md)</p> |  | <p>`ReadonlyArray<PackageJsonDependency>`</p> | <p><b><i>(BETA)</i></b> The list of dependencies of type DependencyType.Dev.</p> |
|  <p>[filePath](./rush-lib.packagejsoneditor.filepath.md)</p> |  | <p>`string`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[name](./rush-lib.packagejsoneditor.name.md)</p> |  | <p>`string`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[version](./rush-lib.packagejsoneditor.version.md)</p> |  | <p>`string`</p> | <p><b><i>(BETA)</i></b></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[addOrUpdateDependency(packageName, newVersion, dependencyType)](./rush-lib.packagejsoneditor.addorupdatedependency.md)</p> |  | <p><b><i>(BETA)</i></b></p> |
|  <p>[fromObject(object, filename)](./rush-lib.packagejsoneditor.fromobject.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[load(filePath)](./rush-lib.packagejsoneditor.load.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[saveIfModified()](./rush-lib.packagejsoneditor.saveifmodified.md)</p> |  | <p><b><i>(BETA)</i></b></p> |
|  <p>[tryGetDependency(packageName)](./rush-lib.packagejsoneditor.trygetdependency.md)</p> |  | <p><b><i>(BETA)</i></b></p> |
|  <p>[tryGetDevDependency(packageName)](./rush-lib.packagejsoneditor.trygetdevdependency.md)</p> |  | <p><b><i>(BETA)</i></b></p> |

