[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [EnvironmentVariableNames](./rush-lib.environmentvariablenames.md)

## EnvironmentVariableNames enum

Names of environment variables used by Rush.

<b>Signature:</b>

```typescript
export declare const enum EnvironmentVariableNames 
```

## Enumeration Members

|  Member | Value | Description |
|  --- | --- | --- |
|  RUSH\_ABSOLUTE\_SYMLINKS | `"RUSH_ABSOLUTE_SYMLINKS"` | If this variable is set to "true", Rush will create symlinks with absolute paths instead of relative paths. This can be necessary when a repository is moved during a build or if parts of a repository are moved into a sandbox. |
|  RUSH\_PREVIEW\_VERSION | `"RUSH_PREVIEW_VERSION"` | This variable overrides the version of Rush that will be installed by the version selector. The default value is determined by the "rushVersion" field from rush.json. |
|  RUSH\_TEMP\_FOLDER | `"RUSH_TEMP_FOLDER"` | This variable overrides the temporary folder used by Rush. The default value is "common/temp" under the repository root. |
|  RUSH\_VARIANT | `"RUSH_VARIANT"` | This variable selects a specific installation variant for Rush to use when installing and linking package dependencies. For more information, see this article: https://rushjs.io/pages/advanced/installation\_variants/ |

