[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [Rush](./rush-lib.rush.md) &gt; [launchRushX](./rush-lib.rush.launchrushx.md)

## Rush.launchRushX() method

This API is used by the `@microsoft/rush` front end to launch the "rushx" command-line. Third-party tools should not use this API. Instead, they should execute the "rushx" binary and start a new NodeJS process.

<b>Signature:</b>

```typescript
static launchRushX(launcherVersion: string, isManaged: boolean): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>launcherVersion</p> | <p>`string`</p> | <p>The version of the `@microsoft/rush` wrapper used to call invoke the CLI.</p> |
|  <p>isManaged</p> | <p>`boolean`</p> | <p>True if the tool was invoked from within a project with a rush.json file, otherwise false. We consider a project without a rush.json to be "unmanaged" and we'll print that to the command line when the tool is executed. This is mainly used for debugging purposes.</p> |

<b>Returns:</b>

`void`

