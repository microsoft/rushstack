[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [Rush](./rush-lib.rush.md)

# Rush class

Operations involving the rush tool and its operation.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`version`](./rush-lib.rush.version.md) |  | `string` | The currently executing version of the "rush-lib" library. This is the same as the Rush tool version for that release. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`launch(launcherVersion, isManaged)`](./rush-lib.rush.launch.md) |  | `void` | Executes the Rush CLI. This is expected to be called by the @microsoft/rush package, which acts as a version manager for the Rush tool. The rush-lib API is exposed through the index.ts/js file. |

