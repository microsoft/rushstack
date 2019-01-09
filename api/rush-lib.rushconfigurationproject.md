[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfigurationProject](./rush-lib.rushconfigurationproject.md)

## RushConfigurationProject class

This represents the configuration of a project that is built by Rush, based on the Rush.json configuration file.

<b>Signature:</b>

```typescript
export declare class RushConfigurationProject 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[cyclicDependencyProjects](./rush-lib.rushconfigurationproject.cyclicdependencyprojects.md)</p> |  | <p>`Set<string>`</p> | <p>A list of local projects that appear as devDependencies for this project, but cannot be locally linked because it would create a cyclic dependency; instead, the last published version will be installed in the Common folder.</p><p>These are package names that would be found by RushConfiguration.getProjectByName().</p> |
|  <p>[downstreamDependencyProjects](./rush-lib.rushconfigurationproject.downstreamdependencyprojects.md)</p> |  | <p>`string[]`</p> | <p>A list of projects within the Rush configuration which directly depend on this package.</p> |
|  <p>[isMainProject](./rush-lib.rushconfigurationproject.ismainproject.md)</p> |  | <p>`boolean`</p> | <p><b><i>(BETA)</i></b> Indicate whether this project is the main project for the related version policy.</p><p>False if the project is not for publishing. True if the project is individually versioned or if its lockstep version policy does not specify main project. False if the project is lockstepped and is not the main project for its version policy.</p> |
|  <p>[packageJson](./rush-lib.rushconfigurationproject.packagejson.md)</p> |  | <p>`IPackageJson`</p> | <p>The parsed NPM "package.json" file from projectFolder.</p> |
|  <p>[packageJsonEditor](./rush-lib.rushconfigurationproject.packagejsoneditor.md)</p> |  | <p>`PackageJsonEditor`</p> | <p><b><i>(BETA)</i></b> A useful wrapper around the package.json file for making modifications</p> |
|  <p>[packageName](./rush-lib.rushconfigurationproject.packagename.md)</p> |  | <p>`string`</p> | <p>The name of the NPM package. An error is reported if this name is not identical to packageJson.name.</p><p>Example: `@scope/MyProject`</p> |
|  <p>[projectFolder](./rush-lib.rushconfigurationproject.projectfolder.md)</p> |  | <p>`string`</p> | <p>The full path of the folder that contains the project to be built by Rush.</p><p>Example: `C:\MyRepo\libraries\my-project`</p> |
|  <p>[projectRelativeFolder](./rush-lib.rushconfigurationproject.projectrelativefolder.md)</p> |  | <p>`string`</p> | <p>The relative path of the folder that contains the project to be built by Rush.</p><p>Example: `libraries\my-project`</p> |
|  <p>[reviewCategory](./rush-lib.rushconfigurationproject.reviewcategory.md)</p> |  | <p>`string`</p> | <p>The review category name, or undefined if no category was assigned. This name must be one of the valid choices listed in RushConfiguration.reviewCategories.</p> |
|  <p>[shouldPublish](./rush-lib.rushconfigurationproject.shouldpublish.md)</p> |  | <p>`boolean`</p> | <p>A flag which indicates whether changes to this project should be published. This controls whether or not the project would show up when running `rush change`<!-- -->, and whether or not it should be published during `rush publish`<!-- -->.</p> |
|  <p>[skipRushCheck](./rush-lib.rushconfigurationproject.skiprushcheck.md)</p> |  | <p>`boolean`</p> | <p>If true, then this project will be ignored by the "rush check" command. The default value is false.</p> |
|  <p>[tempProjectName](./rush-lib.rushconfigurationproject.tempprojectname.md)</p> |  | <p>`string`</p> | <p>The unique name for the temporary project that will be generated in the Common folder. For example, if the project name is `@scope/MyProject`<!-- -->, the temporary project name might be `@rush-temp/MyProject-2`<!-- -->.</p><p>Example: `@rush-temp/MyProject-2`</p> |
|  <p>[unscopedTempProjectName](./rush-lib.rushconfigurationproject.unscopedtempprojectname.md)</p> |  | <p>`string`</p> | <p>The unscoped temporary project name</p><p>Example: `my-project-2`</p> |
|  <p>[versionPolicy](./rush-lib.rushconfigurationproject.versionpolicy.md)</p> |  | <p>`VersionPolicy | undefined`</p> | <p><b><i>(BETA)</i></b> Version policy of the project</p> |
|  <p>[versionPolicyName](./rush-lib.rushconfigurationproject.versionpolicyname.md)</p> |  | <p>`string | undefined`</p> | <p><b><i>(BETA)</i></b> Name of the version policy used by this project.</p> |

