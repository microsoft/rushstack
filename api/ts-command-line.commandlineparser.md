[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParser](./ts-command-line.commandlineparser.md)

## CommandLineParser class

The "argparse" library is a relatively advanced command-line parser with features such as word-wrapping and intelligible error messages (that are lacking in other similar libraries such as commander, yargs, and nomnom). Unfortunately, its ruby-inspired API is awkward to use. The abstract base classes CommandLineParser and CommandLineAction provide a wrapper for "argparse" that makes defining and consuming arguments quick and simple, and enforces that appropriate documentation is provided for each parameter.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineParser extends CommandLineParameterProvider 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[actions](./ts-command-line.commandlineparser.actions.md)</p> |  | <p>`ReadonlyArray<CommandLineAction>`</p> | <p>Returns the list of actions that were defined for this CommandLineParser object.</p> |
|  <p>[selectedAction](./ts-command-line.commandlineparser.selectedaction.md)</p> |  | <p>`CommandLineAction | undefined`</p> | <p>Reports which CommandLineAction was specified on the command line.</p> |
|  <p>[toolDescription](./ts-command-line.commandlineparser.tooldescription.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[toolFilename](./ts-command-line.commandlineparser.toolfilename.md)</p> |  | <p>`string`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[addAction(action)](./ts-command-line.commandlineparser.addaction.md)</p> |  | <p>Defines a new action that can be used with the CommandLineParser instance.</p> |
|  <p>[execute(args)](./ts-command-line.commandlineparser.execute.md)</p> |  | <p>The program entry point will call this method to begin parsing command-line arguments and executing the corresponding action.</p> |
|  <p>[executeWithoutErrorHandling(args)](./ts-command-line.commandlineparser.executewithouterrorhandling.md)</p> |  | <p>This is similar to [CommandLineParser.execute()](./ts-command-line.commandlineparser.execute.md)<!-- -->, except that execution errors simply cause the promise to reject. It is the caller's responsibility to trap</p> |
|  <p>[getAction(actionName)](./ts-command-line.commandlineparser.getaction.md)</p> |  | <p>Retrieves the action with the specified name. If no matching action is found, an exception is thrown.</p> |
|  <p>[onExecute()](./ts-command-line.commandlineparser.onexecute.md)</p> |  | <p>This hook allows the subclass to perform additional operations before or after the chosen action is executed.</p> |
|  <p>[tryGetAction(actionName)](./ts-command-line.commandlineparser.trygetaction.md)</p> |  | <p>Retrieves the action with the specified name. If no matching action is found, undefined is returned.</p> |

