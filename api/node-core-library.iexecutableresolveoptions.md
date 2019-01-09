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

|  Property | Type | Description |
|  --- | --- | --- |
|  [currentWorkingDirectory](./node-core-library.iexecutableresolveoptions.currentworkingdirectory.md) | `string` | <b><i>(BETA)</i></b> The current working directory. If omitted, process.cwd() will be used. |
|  [environment](./node-core-library.iexecutableresolveoptions.environment.md) | `NodeJS.ProcessEnv` | <b><i>(BETA)</i></b> The environment variables for the child process. If omitted, process.env will be used. |

