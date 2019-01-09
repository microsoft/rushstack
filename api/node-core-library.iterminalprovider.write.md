[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [ITerminalProvider](./node-core-library.iterminalprovider.md) &gt; [write](./node-core-library.iterminalprovider.write.md)

## ITerminalProvider.write() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This function gets called on every terminal provider upon every message function call on the terminal instance.

<b>Signature:</b>

```typescript
write(data: string, severity: TerminalProviderSeverity): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>data</p> | <p>`string`</p> | <p>The terminal message.</p> |
|  <p>severity</p> | <p>`TerminalProviderSeverity`</p> | <p>The message severity. Terminal providers can route different kinds of messages to different streams and may choose to ignore verbose messages.</p> |

<b>Returns:</b>

`void`

