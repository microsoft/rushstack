[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md)

## CommandLineParameterProvider class

This is the common base class for CommandLineAction and CommandLineParser that provides functionality for defining command-line parameters.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineParameterProvider 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [parameters](./ts-command-line.commandlineparameterprovider.parameters.md) |  | `ReadonlyArray<CommandLineParameter>` | Returns a collection of the parameters that were defined for this object. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [defineChoiceParameter(definition)](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md) |  | Defines a command-line parameter whose value must be a string from a fixed set of allowable choices (similar to an enum). |
|  [defineFlagParameter(definition)](./ts-command-line.commandlineparameterprovider.defineflagparameter.md) |  | Defines a command-line switch whose boolean value is true if the switch is provided, and false otherwise. |
|  [defineIntegerParameter(definition)](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md) |  | Defines a command-line parameter whose value is an integer. |
|  [defineStringListParameter(definition)](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md) |  | Defines a command-line parameter whose value is one or more text strings. |
|  [defineStringParameter(definition)](./ts-command-line.commandlineparameterprovider.definestringparameter.md) |  | Defines a command-line parameter whose value is a single text string. |
|  [getChoiceParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getchoiceparameter.md) |  | Returns the CommandLineChoiceParameter with the specified long name. |
|  [getFlagParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getflagparameter.md) |  | Returns the CommandLineFlagParameter with the specified long name. |
|  [getIntegerParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getintegerparameter.md) |  | Returns the CommandLineIntegerParameter with the specified long name. |
|  [getStringListParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getstringlistparameter.md) |  | Returns the CommandLineStringListParameter with the specified long name. |
|  [getStringParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getstringparameter.md) |  | Returns the CommandLineStringParameter with the specified long name. |
|  [onDefineParameters()](./ts-command-line.commandlineparameterprovider.ondefineparameters.md) |  | The child class should implement this hook to define its command-line parameters, e.g. by calling defineFlagParameter(). |
|  [renderHelpText()](./ts-command-line.commandlineparameterprovider.renderhelptext.md) |  | Generates the command-line help text. |

