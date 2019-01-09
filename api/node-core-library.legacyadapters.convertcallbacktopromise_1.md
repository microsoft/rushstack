[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [LegacyAdapters](./node-core-library.legacyadapters.md) &gt; [convertCallbackToPromise](./node-core-library.legacyadapters.convertcallbacktopromise_1.md)

## LegacyAdapters.convertCallbackToPromise() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

<b>Signature:</b>

```typescript
static convertCallbackToPromise<TResult, TError, TArg1>(fn: (arg1: TArg1, cb: callback<TResult, TError>) => void, arg1: TArg1): Promise<TResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  fn | `(arg1: TArg1, cb: callback<TResult, TError>) => void` |  |
|  arg1 | `TArg1` |  |

<b>Returns:</b>

`Promise<TResult>`

