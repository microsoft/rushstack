[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfigurationProject](./rush-lib.rushconfigurationproject.md)

## RushConfigurationProject class

This represents the configuration of a project that is built by Rush, based on the Rush.json configuration file.

<b>Signature:</b>

```typescript
export declare class RushConfigurationProject 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [cyclicDependencyProjects](./rush-lib.rushconfigurationproject.cyclicdependencyprojects.md) |  | `Set<string>` | A list of local projects that appear as devDependencies for this project, but cannot be locally linked because it would create a cyclic dependency; instead, the last published version will be installed in the Common folder.<!-- -->These are package names that would be found by RushConfiguration.getProjectByName(). |
|  [downstreamDependencyProjects](./rush-lib.rushconfigurationproject.downstreamdependencyprojects.md) |  | `string[]` | A list of projects within the Rush configuration which directly depend on this package. |
|  [isMainProject](./rush-lib.rushconfigurationproject.ismainproject.md) |  | `boolean` | <b><i>(BETA)</i></b> Indicate whether this project is the main project for the related version policy.<!-- -->False if the project is not for publishing. True if the project is individually versioned or if its lockstep version policy does not specify main project. False if the project is lockstepped and is not the main project for its version policy. |
|  [packageJson](./rush-lib.rushconfigurationproject.packagejson.md) |  | `IPackageJson` | The parsed NPM "package.json" file from projectFolder. |
|  [packageJsonEditor](./rush-lib.rushconfigurationproject.packagejsoneditor.md) |  | `PackageJsonEditor` | <b><i>(BETA)</i></b> A useful wrapper around the package.json file for making modifications |
|  [packageName](./rush-lib.rushconfigurationproject.packagename.md) |  | `string` | The name of the NPM package. An error is reported if this name is not identical to packageJson.name.<!-- -->Example: `@scope/MyProject` |
|  [projectFolder](./rush-lib.rushconfigurationproject.projectfolder.md) |  | `string` | The full path of the folder that contains the project to be built by Rush.<!-- -->Example: `C:\MyRepo\libraries\my-project` |
|  [projectRelativeFolder](./rush-lib.rushconfigurationproject.projectrelativefolder.md) |  | `string` | The relative path of the folder that contains the project to be built by Rush.<!-- -->Example: `libraries\my-project` |
|  [reviewCategory](./rush-lib.rushconfigurationproject.reviewcategory.md) |  | `string` | The review category name, or undefined if no category was assigned. This name must be one of the valid choices listed in RushConfiguration.reviewCategories. |
|  [shouldPublish](./rush-lib.rushconfigurationproject.shouldpublish.md) |  | `boolean` | A flag which indicates whether changes to this project should be published. This controls whether or not the project would show up when running `rush change`<!-- -->, and whether or not it should be published during `rush publish`<!-- -->. |
|  [skipRushCheck](./rush-lib.rushconfigurationproject.skiprushcheck.md) |  | `boolean` | If true, then this project will be ignored by the "rush check" command. The default value is false. |
|  [tempProjectName](./rush-lib.rushconfigurationproject.tempprojectname.md) |  | `string` | The unique name for the temporary project that will be generated in the Common folder. For example, if the project name is `@scope/MyProject`<!-- -->, the temporary project name might be `@rush-temp/MyProject-2`<!-- -->.<!-- -->Example: `@rush-temp/MyProject-2` |
|  [unscopedTempProjectName](./rush-lib.rushconfigurationproject.unscopedtempprojectname.md) |  | `string` | The unscoped temporary project name<!-- -->Example: `my-project-2` |
|  [versionPolicy](./rush-lib.rushconfigurationproject.versionpolicy.md) |  | `VersionPolicy | undefined` | <b><i>(BETA)</i></b> Version policy of the project |
|  [versionPolicyName](./rush-lib.rushconfigurationproject.versionpolicyname.md) |  | `string | undefined` | <b><i>(BETA)</i></b> Name of the version policy used by this project. |

