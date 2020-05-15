# ts-command-line-test

This project folder is a minimal code sample illustrating how to make a command-line tool
using the [@rushstack/ts-command-line](https://www.npmjs.com/package/@rushstack/ts-command-line) library.
Building this project is one of the CI tests for the library.

## Trying the demo

Compile the project:
```sh
# clone the repo
$ git clone https://github.com/microsoft/rushstack
$ cd rushstack

# build the code
$ rush install
$ rush rebuild

# run the demo using Bash
$ cd build_tests/ts-command-line-test
$ ./widget.sh --help

# OR, run the demo using Windows shell
$ cd build_tests\ts-command-line-test
$ widget --help
```

You should see something like this:

```
usage: widget [-h] [-v] <command> ...

The "widget" tool is a code sample for using the @rushstack/ts-command-line
library.

Positional arguments:
  <command>
    push         Pushes a widget to the service
    run          This action (hypothetically) passes its command line
                 arguments to the shell to be executed.

Optional arguments:
  -h, --help     Show this help message and exit.
  -v, --verbose  Show extra logging detail

For detailed help about a specific command, use: widget <command> -h
```

This top-level command line is defined in [WidgetCommandLine.ts](./src/WidgetCommandLine.ts).

## Command line "actions"

Actions are an optional feature of **ts-command-line**.  They work like Git subcommands.
Our `widget` demo supports two actions, `push` and `run`.  For example, if you type this:

```sh
$ ./widget.sh push --help
```

...then you should see specialized help for the "push" action:

```
usage: widget push [-h] [-f] [--protocol {ftp,webdav,scp}]

Here we provide a longer description of how our action works.

Optional arguments:
  -h, --help            Show this help message and exit.
  -f, --force           Push and overwrite any existing state
  --protocol {ftp,webdav,scp}
                        Specify the protocol to use. This parameter may
                        alternatively specified via the WIDGET_PROTOCOL
                        environment variable. The default value is "scp".
```

The "push" action is defined in [PushAction.ts](./src/PushAction.ts).


The demo prints its command line arguments when you invoke the action:

```sh
$ ./widget.sh push --protocol webdav --force

Business logic configured the logger: verbose=false
Received parameters: force=true, protocol="webdav"
Business logic did the work.
```

## Some advanced features

The `run` command illustrates a couple other interesting features.  It shows how to
use `defineCommandLineRemainder()` to capture the remainder of the command line arguments.

```
usage: widget run [-h] [--title TITLE] ...

This demonstrates how to use the defineCommandLineRemainder() API.

Positional arguments:
  "..."          The remaining arguments are passed along to the command
                 shell.

Optional arguments:
  -h, --help     Show this help message and exit.
  --title TITLE  An optional title to show in the console window. This
                 parameter may alternatively specified via the WIDGET_TITLE
                 environment variable.
```

The "run" action is defined in [RunAction.ts](./src/PushAction.ts).

Example invocation:

```sh
$ ./widget.sh run --title "Hello" 1 2 3

Business logic configured the logger: verbose=false
Console Title: Hello
Arguments to be executed: ["1","2","3"]
```

Also, notice that `environmentVariable: 'WIDGET_TITLE'` allows the title to be specified using a
Bash environment variable:

```sh
$ export WIDGET_TITLE="Default title"
$ ./widget.sh run 1 2 3

Business logic configured the logger: verbose=false
Console Title: Default title
Arguments to be executed: ["1","2","3"]
```

For more about environment variables, see the [IBaseCommandLineDefinition.environmentVariable](https://rushstack.io/pages/api/ts-command-line.ibasecommandlinedefinition.environmentvariable/) documentation.

## More information

See [@rushstack/ts-command-line](https://www.npmjs.com/package/@rushstack/ts-command-line) for details.

