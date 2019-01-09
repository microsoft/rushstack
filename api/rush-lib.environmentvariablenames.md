[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [EnvironmentVariableNames](./rush-lib.environmentvariablenames.md)

## EnvironmentVariableNames enum

Names of environment variables used by Rush.

<b>Signature:</b>

```typescript
export declare const enum EnvironmentVariableNames 
```

## Enumeration Members

|  <p>Member</p> | <p>Value</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>RUSH\_ABSOLUTE\_SYMLINKS</p> | <p>`"RUSH_ABSOLUTE_SYMLINKS"`</p> | <p>If this variable is set to "true", Rush will create symlinks with absolute paths instead of relative paths. This can be necessary when a repository is moved during a build or if parts of a repository are moved into a sandbox.</p> |
|  <p>RUSH\_PREVIEW\_VERSION</p> | <p>`"RUSH_PREVIEW_VERSION"`</p> | <p>This variable overrides the version of Rush that will be installed by the version selector. The default value is determined by the "rushVersion" field from rush.json.</p> |
|  <p>RUSH\_TEMP\_FOLDER</p> | <p>`"RUSH_TEMP_FOLDER"`</p> | <p>This variable overrides the temporary folder used by Rush. The default value is "common/temp" under the repository root.</p> |
|  <p>RUSH\_VARIANT</p> | <p>`"RUSH_VARIANT"`</p> | <p>This variable selects a specific installation variant for Rush to use when installing and linking package dependencies. For more information, see this article: https://rushjs.io/pages/advanced/installation\_variants/</p> |

