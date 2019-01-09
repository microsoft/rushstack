[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IExecutableSpawnSyncOptions](./node-core-library.iexecutablespawnsyncoptions.md) &gt; [maxBuffer](./node-core-library.iexecutablespawnsyncoptions.maxbuffer.md)

## IExecutableSpawnSyncOptions.maxBuffer property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

The largest amount of bytes allowed on stdout or stderr for this synchonous operation. If exceeded, the child process will be terminated. The default is 200 \* 1024.

<b>Signature:</b>

```typescript
maxBuffer?: number;
```
