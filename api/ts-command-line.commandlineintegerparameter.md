[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineIntegerParameter](./ts-command-line.commandlineintegerparameter.md)

# CommandLineIntegerParameter class

The data type returned by [CommandLineParameterProvider.defineIntegerParameter](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md)<!-- -->.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`defaultValue`](./ts-command-line.commandlineintegerparameter.defaultvalue.md) |  | `number | undefined` | The default value which will be used if the parameter is omitted from the command line. |
|  [`kind`](./ts-command-line.commandlineintegerparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`value`](./ts-command-line.commandlineintegerparameter.value.md) |  | `number | undefined` | Returns the argument value for an integer parameter that was parsed from the command line. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendToArgList(argList)`](./ts-command-line.commandlineintegerparameter.appendtoarglist.md) |  | `void` | Append the parsed values to the provided string array. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineIntegerParameter class.

