[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineStringListParameter](./ts-command-line.commandlinestringlistparameter.md)

# CommandLineStringListParameter class

The data type returned by [CommandLineParameterProvider.defineStringListParameter](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md)<!-- -->.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`kind`](./ts-command-line.commandlinestringlistparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`values`](./ts-command-line.commandlinestringlistparameter.values.md) |  | `ReadonlyArray<string>` | Returns the string arguments for a string list parameter that was parsed from the command line. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendToArgList(argList)`](./ts-command-line.commandlinestringlistparameter.appendtoarglist.md) |  | `void` | Append the parsed values to the provided string array. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineStringListParameter class.

