[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [Rush](rush-lib.rush.md) &gt; [launch](rush-lib.rush.launch.md)

# Rush.launch method

Executes the Rush CLI. This is expected to be called by the @microsoft/rush package, which acts as a version manager for the Rush tool. The rush-lib API is exposed through the index.ts/js file.

**Signature:**
```javascript
public static launch(launcherVersion: string, isManaged: boolean): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `launcherVersion` | `string` | The version of the @microsoft/rush wrapper used to call invoke the CLI. |
|  `isManaged` | `boolean` | True if the tool was invoked from within a project with a rush.json file, otherwise false. We consider a project without a rush.json to be "unmanaged" and we'll print that to the command line when the tool is executed. This is mainly used for debugging purposes. |

