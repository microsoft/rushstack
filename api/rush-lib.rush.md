[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [Rush](./rush-lib.rush.md)

## Rush class

General operations for the Rush engine.

<b>Signature:</b>

```typescript
export declare class Rush 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [version](./rush-lib.rush.version.md) | `static` | `string` | The currently executing version of the "rush-lib" library. This is the same as the Rush tool version for that release. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [launch(launcherVersion, isManaged)](./rush-lib.rush.launch.md) | `static` | This API is used by the `@microsoft/rush` front end to launch the "rush" command-line. Third-party tools should not use this API. Instead, they should execute the "rush" binary and start a new NodeJS process. |
|  [launchRushX(launcherVersion, isManaged)](./rush-lib.rush.launchrushx.md) | `static` | This API is used by the `@microsoft/rush` front end to launch the "rushx" command-line. Third-party tools should not use this API. Instead, they should execute the "rushx" binary and start a new NodeJS process. |

