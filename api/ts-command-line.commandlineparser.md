[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParser](./ts-command-line.commandlineparser.md)

# CommandLineParser class

The "argparse" library is a relatively advanced command-line parser with features such as word-wrapping and intelligible error messages (that are lacking in other similar libraries such as commander, yargs, and nomnom). Unfortunately, its ruby-inspired API is awkward to use. The abstract base classes CommandLineParser and CommandLineAction provide a wrapper for "argparse" that makes defining and consuming arguments quick and simple, and enforces that appropriate documentation is provided for each parameter.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`actions`](./ts-command-line.commandlineparser.actions.md) |  | `ReadonlyArray<CommandLineAction>` | Returns the list of actions that were defined for this CommandLineParser object. |
|  [`selectedAction`](./ts-command-line.commandlineparser.selectedaction.md) |  | `CommandLineAction | undefined` | Reports which CommandLineAction was specified on the command line. |
|  [`toolDescription`](./ts-command-line.commandlineparser.tooldescription.md) |  | `string` | General documentation that is included in the "--help" main page |
|  [`toolFilename`](./ts-command-line.commandlineparser.toolfilename.md) |  | `string` | The name of your tool when invoked from the command line |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(options)`](./ts-command-line.commandlineparser.constructor.md) |  |  | Constructs a new instance of the [CommandLineParser](./ts-command-line.commandlineparser.md) class |
|  [`addAction(action)`](./ts-command-line.commandlineparser.addaction.md) |  | `void` | Defines a new action that can be used with the CommandLineParser instance. |
|  [`execute(args)`](./ts-command-line.commandlineparser.execute.md) |  | `Promise<boolean>` | The program entry point will call this method to begin parsing command-line arguments and executing the corresponding action. |
|  [`executeWithoutErrorHandling(args)`](./ts-command-line.commandlineparser.executewithouterrorhandling.md) |  | `Promise<void>` | This is similar to [CommandLineParser.execute](./ts-command-line.commandlineparser.execute.md)<!-- -->, except that execution errors simply cause the promise to reject. It is the caller's responsibility to trap |
|  [`getAction(actionName)`](./ts-command-line.commandlineparser.getaction.md) |  | `CommandLineAction` | Retrieves the action with the specified name. If no matching action is found, an exception is thrown. |
|  [`onExecute()`](./ts-command-line.commandlineparser.onexecute.md) | `protected` | `Promise<void>` | This hook allows the subclass to perform additional operations before or after the chosen action is executed. |
|  [`tryGetAction(actionName)`](./ts-command-line.commandlineparser.trygetaction.md) |  | `CommandLineAction | undefined` | Retrieves the action with the specified name. If no matching action is found, undefined is returned. |

