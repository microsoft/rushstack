[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IExecutableSpawnSyncOptions](./node-core-library.iexecutablespawnsyncoptions.md)

## IExecutableSpawnSyncOptions interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Options for Executable.execute().

<b>Signature:</b>

```typescript
export interface IExecutableSpawnSyncOptions extends IExecutableResolveOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[input](./node-core-library.iexecutablespawnsyncoptions.input.md)</p> | <p>`string`</p> | <p><b><i>(BETA)</i></b> The content to be passed to the child process's stdin.</p><p>NOTE: If specified, this content replaces any IExecutableSpawnSyncOptions.stdio\[0\] mapping for stdin.</p> |
|  <p>[maxBuffer](./node-core-library.iexecutablespawnsyncoptions.maxbuffer.md)</p> | <p>`number`</p> | <p><b><i>(BETA)</i></b> The largest amount of bytes allowed on stdout or stderr for this synchonous operation. If exceeded, the child process will be terminated. The default is 200 \* 1024.</p> |
|  <p>[stdio](./node-core-library.iexecutablespawnsyncoptions.stdio.md)</p> | <p>`ExecutableStdioMapping`</p> | <p><b><i>(BETA)</i></b> The stdio mappings for the child process.</p><p>NOTE: If IExecutableSpawnSyncOptions.input is provided, it will take precedence over the stdin mapping (stdio\[0\]).</p> |
|  <p>[timeoutMs](./node-core-library.iexecutablespawnsyncoptions.timeoutms.md)</p> | <p>`number`</p> | <p><b><i>(BETA)</i></b> The maximum time the process is allowed to run before it will be terminated.</p> |

