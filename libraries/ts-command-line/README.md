# ts-command-line

This library makes it easy to create professional command-line tools for NodeJS. By "**professional**", we mean:

- **no gotchas for users**:  This requirement seems obvious, but try typing "`npm install --save-dex`" instead of "`npm install --save-dev`" sometime.  The mistyped letter gets silently ignored, and the command appears to execute successfully!  This can be extremely confusing and frustrating.  It plagues many familiar NodeJS tools.  For a great user experience, the command line should always use a strict parser that catches these mistakes.

- **no gotchas for developers**:  Most JavaScript command-line parsers store their output in a simple hash object.  This is very convenient for small projects, but suppose many different source files participate in defining and reading command-line parameters:  A misspelled variable name is indistinguishable from a real flag that was omitted. Even if you get the names right, the data type might be unpredictable (is that count `1` or `"1"`?).  **ts-command-line** models each parameter type as a real TypeScript class.

- **automatic documentation**: Some command-line libraries treat the `--help` docs as a separate exercise for the reader.  **ts-command-line** requires documentation for every parameter, and automatically generates the `--help` for you.  If you write long paragraphs, they will be word-wrapped correctly. (Yay!)

- **structure and extensibility**: Instead of a simple function chain, **ts-command-line** provides a  "scaffold" pattern that makes it easy to find and understand the command-line parser for tool project.  The scaffold model is generally recommended, but there's also a "dynamic" model if you need it.  (See below.)

Internally, **ts-command-line** is based on [argparse](https://www.npmjs.com/package/argparse) and the Python approach to command-lines.  Compared to other libraries, it doesn't provide zillions of alternative syntaxes and bells and whistles.  But if you're looking for a simple, professional, railed experience for your command-line tool, give it a try!


### Some Terminology

Suppose that we want to parse a command-line like this:

```
widget --verbose push --force --max-count 123
```

In this example, we can identify the following components:

- **"parameter"**:  The `--verbose`, `--force`, and `--max-count` are called *parameters*.  The currently supported parameter types include: **flag** (i.e. boolean), **integer**, **string**, **choice** (i.e. enums), and **string list**.

- **"argument"**: The value "123" is the *argument* for the `--max-count` integer parameter.  (Flags don't have arguments, because their value is determined by whether the flag was provided or not.)

- **"action"**: Similar to Git's command-line, the `push` token acts as sub-command with its own unique set of parameters.  This means that **global parameters** come before the action and affect all actions, whereas **action parameters** come after the action and only affect that action.


## Scaffold Model

The scaffold model  works by extending the abstract base classes `CommandLineParser` (for the overall command-line) and `CommandLineAction` for a specific subcommand.

Continuing our example from above, suppose we want to start with a couple simple flags like this:

```
widget --verbose push --force
```

We could define a subclass for the "`push`" action like this:

```typescript
class PushAction extends CommandLineAction {
  private _force: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'push',
      summary: 'Pushes a widget to the service',
      documentation: 'More detail about the "push" action'
    });
  }

  protected onExecute(): Promise<void> { // abstract
    return BusinessLogic.doTheWork(this._force.value);
  }

  protected onDefineParameters(): void { // abstract
    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      description: 'Push and overwrite any existing state'
    });
  }
}
```

Then we might define the parser subclass like this:

```typescript
class WidgetCommandLine extends CommandLineParser {
  private _verbose: CommandLineFlagParameter;

  public constructor() {
    super({
      toolFilename: 'widget',
      toolDescription: 'Documentation for the "widget" tool'
    });

    this.addAction(new PushAction());
  }

  protected onDefineParameters(): void { // abstract
    this._verbose = this.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'Show extra logging detail'
    });
  }

  protected onExecute(): Promise<void> { // override
    BusinessLogic.configureLogger(this._verbose.value);
    return super.onExecute();
  }
}
```

To invoke the parser, the application entry point will do something like this:

```typescript
const commandLine: WidgetCommandLine = new WidgetCommandLine();
commandLine.execute();
```

When we run `widget --verbose push --force`, the `PushAction.onExecute()` method will get invoked and your business logic takes over.


#### Testing out the docs

If you invoke the tool as "`widget --help`", the docs are automatically generated:

```
usage: widget [-h] [--verbose] <command> ...

Documentation for the "widget" tool

Positional arguments:
  <command>
    push      Pushes a widget to the service

Optional arguments:
  -h, --help  Show this help message and exit.
  --verbose   Show extra logging detail

For detailed help about a specific command, use: widget <command> -h
```

For help about the `push` action, the user can type "`widget push --help`", which shows this output:

```
usage: widget push [-h] [--force]

More detail about the "push" action

Optional arguments:
  -h, --help  Show this help message and exit.
  --force     Push and overwrite any existing state
```

## Dynamic Model

Creating subclasses provides a simple, recognizable pattern that you can use across all your tooling projects. It's the generally recommended approach. However, there are some cases where we need to break out of the scaffold.  For example:

- Actions or parameters are discovered at runtime, e.g. from a config file
- The actions and their implementations aren't closely coupled

In this case, you can use the `DynamicCommandLineAction` and `DynamicCommandLineParser`  classes which are not abstract (and not intended to be subclassed).  Here's our above example rewritten for this model:

```typescript
// Define the parser
const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
  toolFilename: 'widget',
  toolDescription: 'Documentation for the "widget" tool'
});
commandLineParser.defineFlagParameter({
  parameterLongName: '--verbose',
  description: 'Show extra logging detail'
});

// Define the action
const action: DynamicCommandLineAction = new DynamicCommandLineAction({
  actionName: 'push',
  summary: 'Pushes a widget to the service',
  documentation: 'More detail about the "push" action'
});
commandLineParser.addAction(action);

action.defineFlagParameter({
  parameterLongName: '--force',
  description: 'Push and overwrite any existing state'
});

// Parse the command line
commandLineParser.execute().then(() => {
  console.log('The action is: ' + commandLineParser.selectedAction!.actionName);
  console.log('The force flag is: ' + action.getFlagParameter('--force').value);
});
```

You can also mix the two models.  For example, we could augment the `WidgetCommandLine` from the original model by adding `DynamicAction` objects to it.


### Real world examples

Here are some GitHub projects that illustrate different use cases for **ts-command-line**:

- [@microsoft/rush](https://www.npmjs.com/package/@microsoft/rush)
- [@microsoft/api-extractor](https://www.npmjs.com/package/@microsoft/api-extractor)
- [@microsoft/api-documenter](https://www.npmjs.com/package/@microsoft/api-documenter)
