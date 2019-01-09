[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineAction](./ts-command-line.commandlineaction.md)

## CommandLineAction class

Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineAction extends CommandLineParameterProvider 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [actionName](./ts-command-line.commandlineaction.actionname.md) |  | `string` |  |
|  [documentation](./ts-command-line.commandlineaction.documentation.md) |  | `string` |  |
|  [summary](./ts-command-line.commandlineaction.summary.md) |  | `string` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [onDefineParameters()](./ts-command-line.commandlineaction.ondefineparameters.md) |  |  |
|  [onExecute()](./ts-command-line.commandlineaction.onexecute.md) |  | Your subclass should implement this hook to perform the operation. |

