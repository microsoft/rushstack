[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineAction](./ts-command-line.commandlineaction.md)

## CommandLineAction class

Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineAction extends CommandLineParameterProvider 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[actionName](./ts-command-line.commandlineaction.actionname.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[documentation](./ts-command-line.commandlineaction.documentation.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[summary](./ts-command-line.commandlineaction.summary.md)</p> |  | <p>`string`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[onDefineParameters()](./ts-command-line.commandlineaction.ondefineparameters.md)</p> |  | <p></p> |
|  <p>[onExecute()](./ts-command-line.commandlineaction.onexecute.md)</p> |  | <p>Your subclass should implement this hook to perform the operation.</p> |

