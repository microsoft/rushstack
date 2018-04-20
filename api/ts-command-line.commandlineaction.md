[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineAction](./ts-command-line.commandlineaction.md)

# CommandLineAction class

Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`actionName`](./ts-command-line.commandlineaction.actionname.md) |  | `string` | The name of the action. For example, if the tool is called "example", then the "build" action might be invoked as: "example build -q --some-other-option" |
|  [`documentation`](./ts-command-line.commandlineaction.documentation.md) |  | `string` | A detailed description that is shown on the action help page, which is displayed by the command "example build --help", e.g. for actionName="build". |
|  [`summary`](./ts-command-line.commandlineaction.summary.md) |  | `string` | A quick summary that is shown on the main help page, which is displayed by the command "example --help" |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(options)`](./ts-command-line.commandlineaction.constructor.md) |  |  | Constructs a new instance of the [CommandLineAction](./ts-command-line.commandlineaction.md) class |
|  [`onDefineParameters()`](./ts-command-line.commandlineaction.ondefineparameters.md) | `protected` | `void` | The child class should implement this hook to define its command-line parameters, e.g. by calling defineFlagParameter(). |
|  [`onExecute()`](./ts-command-line.commandlineaction.onexecute.md) | `protected` | `Promise<void>` | Your subclass should implement this hook to perform the operation. |

