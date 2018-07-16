[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineStringParameter](./ts-command-line.commandlinestringparameter.md)

# CommandLineStringParameter class

The data type returned by [CommandLineParameterProvider.defineStringParameter](./ts-command-line.commandlineparameterprovider.definestringparameter.md)<!-- -->.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`defaultValue`](./ts-command-line.commandlinestringparameter.defaultvalue.md) |  | `string | undefined` | The default value which will be used if the parameter is omitted from the command line. |
|  [`kind`](./ts-command-line.commandlinestringparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`value`](./ts-command-line.commandlinestringparameter.value.md) |  | `string | undefined` | Returns the argument value for a string parameter that was parsed from the command line. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendToArgList(argList)`](./ts-command-line.commandlinestringparameter.appendtoarglist.md) |  | `void` | Append the parsed values to the provided string array. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineStringParameter class.

