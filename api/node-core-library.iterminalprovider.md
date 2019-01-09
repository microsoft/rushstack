[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [ITerminalProvider](./node-core-library.iterminalprovider.md)

## ITerminalProvider interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Implement the interface to create a terminal provider. Terminal providers can be registered to a [Terminal](./node-core-library.terminal.md) instance to receive messages.

<b>Signature:</b>

```typescript
export interface ITerminalProvider 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[eolCharacter](./node-core-library.iterminalprovider.eolcharacter.md)</p> | <p>`string`</p> | <p><b><i>(BETA)</i></b> This property should return the newline character the terminal provider expects.</p> |
|  <p>[supportsColor](./node-core-library.iterminalprovider.supportscolor.md)</p> | <p>`boolean`</p> | <p><b><i>(BETA)</i></b> This property should return true only if the terminal provider supports rendering console colors.</p> |

## Methods

|  <p>Method</p> | <p>Description</p> |
|  --- | --- |
|  <p>[write(data, severity)](./node-core-library.iterminalprovider.write.md)</p> | <p><b><i>(BETA)</i></b> This function gets called on every terminal provider upon every message function call on the terminal instance.</p> |

