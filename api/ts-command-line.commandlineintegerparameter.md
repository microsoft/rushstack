[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineIntegerParameter](./ts-command-line.commandlineintegerparameter.md)

# CommandLineIntegerParameter class

The data type returned by [CommandLineParameterProvider.defineIntegerParameter](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md)<!-- -->.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`kind`](./ts-command-line.commandlineintegerparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`value`](./ts-command-line.commandlineintegerparameter.value.md) |  | `number | undefined` | Returns the argument value for an integer parameter that was parsed from the command line. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineIntegerParameter class.

