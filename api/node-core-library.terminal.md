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

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [registerProvider(provider)](./node-core-library.terminal.registerprovider.md) |  | <b><i>(BETA)</i></b> Subscribe a new terminal provider. |
|  [unregisterProvider(provider)](./node-core-library.terminal.unregisterprovider.md) |  | <b><i>(BETA)</i></b> Unsubscribe a terminal provider. If the provider isn't subscribed, this function does nothing. |
|  [write(messageParts)](./node-core-library.terminal.write.md) |  | <b><i>(BETA)</i></b> Write a generic message to the terminal |
|  [writeError(messageParts)](./node-core-library.terminal.writeerror.md) |  | <b><i>(BETA)</i></b> Write an error message to the console with red text. |
|  [writeErrorLine(messageParts)](./node-core-library.terminal.writeerrorline.md) |  | <b><i>(BETA)</i></b> Write an error message to the console with red text, followed by a newline. |
|  [writeLine(messageParts)](./node-core-library.terminal.writeline.md) |  | <b><i>(BETA)</i></b> Write a generic message to the terminal, followed by a newline |
|  [writeVerbose(messageParts)](./node-core-library.terminal.writeverbose.md) |  | <b><i>(BETA)</i></b> Write a verbose-level message. |
|  [writeVerboseLine(messageParts)](./node-core-library.terminal.writeverboseline.md) |  | <b><i>(BETA)</i></b> Write a verbose-level message followed by a newline. |
|  [writeWarning(messageParts)](./node-core-library.terminal.writewarning.md) |  | <b><i>(BETA)</i></b> Write a warning message to the console with yellow text. |
|  [writeWarningLine(messageParts)](./node-core-library.terminal.writewarningline.md) |  | <b><i>(BETA)</i></b> Write a warning message to the console with yellow text, followed by a newline. |

