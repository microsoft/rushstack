[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IExecutableResolveOptions](./node-core-library.iexecutableresolveoptions.md)

## IExecutableResolveOptions interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Options for Executable.tryResolve().

<b>Signature:</b>

```typescript
export interface IExecutableResolveOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[currentWorkingDirectory](./node-core-library.iexecutableresolveoptions.currentworkingdirectory.md)</p> | <p>`string`</p> | <p><b><i>(BETA)</i></b> The current working directory. If omitted, process.cwd() will be used.</p> |
|  <p>[environment](./node-core-library.iexecutableresolveoptions.environment.md)</p> | <p>`NodeJS.ProcessEnv`</p> | <p><b><i>(BETA)</i></b> The environment variables for the child process. If omitted, process.env will be used.</p> |

