[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParser](./ts-command-line.commandlineparser.md) &gt; [execute](./ts-command-line.commandlineparser.execute.md)

## CommandLineParser.execute() method

The program entry point will call this method to begin parsing command-line arguments and executing the corresponding action.

<b>Signature:</b>

```typescript
execute(args?: string[]): Promise<boolean>;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>args</p> | <p>`string[]`</p> | <p>the command-line arguments to be parsed; if omitted, then the process.argv will be used</p> |

<b>Returns:</b>

`Promise<boolean>`

## Remarks

The returned promise will never reject: If an error occurs, it will be printed to stderr, process.exitCode will be set to 1, and the promise will resolve to false. This simplifies the most common usage scenario where the program entry point doesn't want to be involved with the command-line logic, and will discard the promise without a then() or catch() block.

If your caller wants to trap and handle errors, use [CommandLineParser.executeWithoutErrorHandling()](./ts-command-line.commandlineparser.executewithouterrorhandling.md) instead.

