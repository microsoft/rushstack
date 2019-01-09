[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IExecutableSpawnSyncOptions](./node-core-library.iexecutablespawnsyncoptions.md) &gt; [stdio](./node-core-library.iexecutablespawnsyncoptions.stdio.md)

## IExecutableSpawnSyncOptions.stdio property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

The stdio mappings for the child process.

NOTE: If IExecutableSpawnSyncOptions.input is provided, it will take precedence over the stdin mapping (stdio\[0\]).

<b>Signature:</b>

```typescript
stdio?: ExecutableStdioMapping;
```
