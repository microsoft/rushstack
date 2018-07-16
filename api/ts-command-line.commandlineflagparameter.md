[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineFlagParameter](./ts-command-line.commandlineflagparameter.md)

# CommandLineFlagParameter class

The data type returned by [CommandLineParameterProvider.defineFlagParameter](./ts-command-line.commandlineparameterprovider.defineflagparameter.md)<!-- -->.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`kind`](./ts-command-line.commandlineflagparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`value`](./ts-command-line.commandlineflagparameter.value.md) |  | `boolean` | Returns a boolean indicating whether the parameter was included in the command line. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendToArgList(argList)`](./ts-command-line.commandlineflagparameter.appendtoarglist.md) |  | `void` | Append the parsed values to the provided string array. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineFlagParameter class.

