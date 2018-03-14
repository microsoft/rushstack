[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [ICommandLineActionOptions](./ts-command-line.icommandlineactionoptions.md)

# ICommandLineActionOptions interface

Options for the CommandLineAction constructor.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`actionVerb`](./ts-command-line.icommandlineactionoptions.actionverb.md) | `string` | The name of the sub-command. For example, if the tool is called "example", then the verb "build" might be invoked as: "foo build -q --some-other-option" |
|  [`documentation`](./ts-command-line.icommandlineactionoptions.documentation.md) | `string` | A detailed description that is shown on the action help page, which is displayed by the command "foo --help build", e.g. for actionVerb="build". |
|  [`summary`](./ts-command-line.icommandlineactionoptions.summary.md) | `string` | A quick summary that is shown on the main help page, which is displayed by the command "foo --help" |

