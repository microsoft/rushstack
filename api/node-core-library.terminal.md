[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Terminal](./node-core-library.terminal.md)

## Terminal class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This class facilitates writing to a console.

<b>Signature:</b>

```typescript
export declare class Terminal 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[registerProvider(provider)](./node-core-library.terminal.registerprovider.md)</p> |  | <p><b><i>(BETA)</i></b> Subscribe a new terminal provider.</p> |
|  <p>[unregisterProvider(provider)](./node-core-library.terminal.unregisterprovider.md)</p> |  | <p><b><i>(BETA)</i></b> Unsubscribe a terminal provider. If the provider isn't subscribed, this function does nothing.</p> |
|  <p>[write(messageParts)](./node-core-library.terminal.write.md)</p> |  | <p><b><i>(BETA)</i></b> Write a generic message to the terminal</p> |
|  <p>[writeError(messageParts)](./node-core-library.terminal.writeerror.md)</p> |  | <p><b><i>(BETA)</i></b> Write an error message to the console with red text.</p> |
|  <p>[writeErrorLine(messageParts)](./node-core-library.terminal.writeerrorline.md)</p> |  | <p><b><i>(BETA)</i></b> Write an error message to the console with red text, followed by a newline.</p> |
|  <p>[writeLine(messageParts)](./node-core-library.terminal.writeline.md)</p> |  | <p><b><i>(BETA)</i></b> Write a generic message to the terminal, followed by a newline</p> |
|  <p>[writeVerbose(messageParts)](./node-core-library.terminal.writeverbose.md)</p> |  | <p><b><i>(BETA)</i></b> Write a verbose-level message.</p> |
|  <p>[writeVerboseLine(messageParts)](./node-core-library.terminal.writeverboseline.md)</p> |  | <p><b><i>(BETA)</i></b> Write a verbose-level message followed by a newline.</p> |
|  <p>[writeWarning(messageParts)](./node-core-library.terminal.writewarning.md)</p> |  | <p><b><i>(BETA)</i></b> Write a warning message to the console with yellow text.</p> |
|  <p>[writeWarningLine(messageParts)](./node-core-library.terminal.writewarningline.md)</p> |  | <p><b><i>(BETA)</i></b> Write a warning message to the console with yellow text, followed by a newline.</p> |

