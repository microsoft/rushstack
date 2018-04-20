[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameter](./ts-command-line.commandlineparameter.md)

# CommandLineParameter class

The base class for the various command-line parameter types.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`description`](./ts-command-line.commandlineparameter.description.md) |  | `string` | Documentation for the flag, that will be shown when invoking the tool with "--help" |
|  [`kind`](./ts-command-line.commandlineparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`longName`](./ts-command-line.commandlineparameter.longname.md) |  | `string` | The long name of the flag including double dashes, e.g. "--do-something" |
|  [`shortName`](./ts-command-line.commandlineparameter.shortname.md) |  | `string | undefined` | An optional short name for the flag including the dash, e.g. "-d" |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`reportInvalidData(data)`](./ts-command-line.commandlineparameter.reportinvaliddata.md) | `protected` | `never` | Internal usage only. Used to report unexpected output from the argparse library. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineParameter class.

