[Home](./index) &gt; [@microsoft/ts-command-line](ts-command-line.md) &gt; [CommandLineAction](ts-command-line.commandlineaction.md)

# CommandLineAction class

Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`options`](ts-command-line.commandlineaction.options.md) |  | `ICommandLineActionOptions` | The options that were passed to the constructor. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(options)`](ts-command-line.commandlineaction.constructor.md) |  |  | Constructs a new instance of the [CommandLineAction](ts-command-line.commandlineaction.md) class |
|  [`onExecute()`](ts-command-line.commandlineaction.onexecute.md) | `protected` | `void` | Your subclass should implement this hook to perform the operation. |

