[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [ExecutableStdioStreamMapping](./node-core-library.executablestdiostreammapping.md)

## ExecutableStdioStreamMapping type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Typings for one of the streams inside IExecutableSpawnSyncOptions.stdio.

<b>Signature:</b>

```typescript
export declare type ExecutableStdioStreamMapping = 'pipe' | 'ignore' | 'inherit' | NodeJS.WritableStream | NodeJS.ReadableStream | number | undefined;
```
