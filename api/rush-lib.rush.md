[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [Rush](./rush-lib.rush.md)

## Rush class

General operations for the Rush engine.

<b>Signature:</b>

```typescript
export declare class Rush 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[version](./rush-lib.rush.version.md)</p> | <p>`static`</p> | <p>`string`</p> | <p>The currently executing version of the "rush-lib" library. This is the same as the Rush tool version for that release.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[launch(launcherVersion, isManaged)](./rush-lib.rush.launch.md)</p> | <p>`static`</p> | <p>This API is used by the `@microsoft/rush` front end to launch the "rush" command-line. Third-party tools should not use this API. Instead, they should execute the "rush" binary and start a new NodeJS process.</p> |
|  <p>[launchRushX(launcherVersion, isManaged)](./rush-lib.rush.launchrushx.md)</p> | <p>`static`</p> | <p>This API is used by the `@microsoft/rush` front end to launch the "rushx" command-line. Third-party tools should not use this API. Instead, they should execute the "rushx" binary and start a new NodeJS process.</p> |

