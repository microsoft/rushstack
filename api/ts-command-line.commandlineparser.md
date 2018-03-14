[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParser](./ts-command-line.commandlineparser.md)

# CommandLineParser class

The "argparse" library is a relatively advanced command-line parser with features such as word-wrapping and intelligible error messages (that are lacking in other similar libraries such as commander, yargs, and nomnom). Unfortunately, its ruby-inspired API is awkward to use. The abstract base classes CommandLineParser and CommandLineAction provide a wrapper for "argparse" that makes defining and consuming arguments quick and simple, and enforces that appropriate documentation is provided for each parameter.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`selectedAction`](./ts-command-line.commandlineparser.selectedaction.md) |  | `CommandLineAction` | Reports which CommandLineAction was selected on the command line. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(options)`](./ts-command-line.commandlineparser.constructor.md) |  |  | Constructs a new instance of the [CommandLineParser](./ts-command-line.commandlineparser.md) class |
|  [`addAction(command)`](./ts-command-line.commandlineparser.addaction.md) |  | `void` | Defines a new action that can be used with the CommandLineParser instance. |
|  [`execute(args)`](./ts-command-line.commandlineparser.execute.md) |  | `Promise<void>` | This is the main entry point to begin parsing command-line arguments and executing the corresponding action. |
|  [`onExecute()`](./ts-command-line.commandlineparser.onexecute.md) | `protected` | `Promise<void>` | This hook allows the subclass to perform additional operations before or after the chosen action is executed. |

