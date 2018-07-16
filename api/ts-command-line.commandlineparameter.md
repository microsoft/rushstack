[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameter](./ts-command-line.commandlineparameter.md)

# CommandLineParameter class

The base class for the various command-line parameter types.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`description`](./ts-command-line.commandlineparameter.description.md) |  | `string` | Documentation for the flag, that will be shown when invoking the tool with "--help" |
|  [`environmentVariable`](./ts-command-line.commandlineparameter.environmentvariable.md) |  | `string | undefined` | The name of an environment variable that the parameter value will be read from, if it was omitted from the command-line. An error will be reported if the environment value cannot be parsed. |
|  [`kind`](./ts-command-line.commandlineparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`longName`](./ts-command-line.commandlineparameter.longname.md) |  | `string` | The long name of the flag including double dashes, e.g. "--do-something" |
|  [`required`](./ts-command-line.commandlineparameter.required.md) |  | `boolean` | If true, then an error occurs if the parameter was not included on the command-line. |
|  [`shortName`](./ts-command-line.commandlineparameter.shortname.md) |  | `string | undefined` | An optional short name for the flag including the dash, e.g. "-d" |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendToArgList(argList)`](./ts-command-line.commandlineparameter.appendtoarglist.md) |  | `void` | Append the parsed values to the provided string array. |
|  [`reportInvalidData(data)`](./ts-command-line.commandlineparameter.reportinvaliddata.md) | `protected` | `never` | Internal usage only. Used to report unexpected output from the argparse library. |
|  [`validateDefaultValue(hasDefaultValue)`](./ts-command-line.commandlineparameter.validatedefaultvalue.md) | `protected` | `void` |  |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineParameter class.

