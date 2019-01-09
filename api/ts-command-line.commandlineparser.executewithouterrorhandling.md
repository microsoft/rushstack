[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParser](./ts-command-line.commandlineparser.md) &gt; [executeWithoutErrorHandling](./ts-command-line.commandlineparser.executewithouterrorhandling.md)

## CommandLineParser.executeWithoutErrorHandling() method

This is similar to [CommandLineParser.execute()](./ts-command-line.commandlineparser.execute.md)<!-- -->, except that execution errors simply cause the promise to reject. It is the caller's responsibility to trap

<b>Signature:</b>

```typescript
executeWithoutErrorHandling(args?: string[]): Promise<void>;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>args</p> | <p>`string[]`</p> |  |

<b>Returns:</b>

`Promise<void>`

