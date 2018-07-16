[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineChoiceParameter](./ts-command-line.commandlinechoiceparameter.md)

# CommandLineChoiceParameter class

The data type returned by [CommandLineParameterProvider.defineChoiceParameter](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md)<!-- -->.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`alternatives`](./ts-command-line.commandlinechoiceparameter.alternatives.md) |  | `ReadonlyArray<string>` | A list of strings (which contain no spaces), of possible options which can be selected |
|  [`defaultValue`](./ts-command-line.commandlinechoiceparameter.defaultvalue.md) |  | `string | undefined` | The default value which will be used if the parameter is omitted from the command line. |
|  [`kind`](./ts-command-line.commandlinechoiceparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [`value`](./ts-command-line.commandlinechoiceparameter.value.md) |  | `string | undefined` | Returns the argument value for a choice parameter that was parsed from the command line. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendToArgList(argList)`](./ts-command-line.commandlinechoiceparameter.appendtoarglist.md) |  | `void` | Append the parsed values to the provided string array. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the CommandLineChoiceParameter class.

