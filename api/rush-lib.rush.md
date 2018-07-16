[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [Rush](./rush-lib.rush.md)

# Rush class

General operations for the Rush engine.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`version`](./rush-lib.rush.version.md) |  | `string` | The currently executing version of the "rush-lib" library. This is the same as the Rush tool version for that release. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`launch(launcherVersion, isManaged)`](./rush-lib.rush.launch.md) |  | `void` | This API is used by the @microsoft/rush front end to launch the "rush" command-line. Third-party tools should not use this API. Instead, they should execute the "rush" binary and start a new NodeJS process. |
|  [`launchRushX(launcherVersion, isManaged)`](./rush-lib.rush.launchrushx.md) |  | `void` | This API is used by the @microsoft/rush front end to launch the "rushx" command-line. Third-party tools should not use this API. Instead, they should execute the "rushx" binary and start a new NodeJS process. |

