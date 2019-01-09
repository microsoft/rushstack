[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md)

## CommandLineParameterProvider class

This is the common base class for CommandLineAction and CommandLineParser that provides functionality for defining command-line parameters.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineParameterProvider 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[parameters](./ts-command-line.commandlineparameterprovider.parameters.md)</p> |  | <p>`ReadonlyArray<CommandLineParameter>`</p> | <p>Returns a collection of the parameters that were defined for this object.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[defineChoiceParameter(definition)](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md)</p> |  | <p>Defines a command-line parameter whose value must be a string from a fixed set of allowable choices (similar to an enum).</p> |
|  <p>[defineFlagParameter(definition)](./ts-command-line.commandlineparameterprovider.defineflagparameter.md)</p> |  | <p>Defines a command-line switch whose boolean value is true if the switch is provided, and false otherwise.</p> |
|  <p>[defineIntegerParameter(definition)](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md)</p> |  | <p>Defines a command-line parameter whose value is an integer.</p> |
|  <p>[defineStringListParameter(definition)](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md)</p> |  | <p>Defines a command-line parameter whose value is one or more text strings.</p> |
|  <p>[defineStringParameter(definition)](./ts-command-line.commandlineparameterprovider.definestringparameter.md)</p> |  | <p>Defines a command-line parameter whose value is a single text string.</p> |
|  <p>[getChoiceParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getchoiceparameter.md)</p> |  | <p>Returns the CommandLineChoiceParameter with the specified long name.</p> |
|  <p>[getFlagParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getflagparameter.md)</p> |  | <p>Returns the CommandLineFlagParameter with the specified long name.</p> |
|  <p>[getIntegerParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getintegerparameter.md)</p> |  | <p>Returns the CommandLineIntegerParameter with the specified long name.</p> |
|  <p>[getStringListParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getstringlistparameter.md)</p> |  | <p>Returns the CommandLineStringListParameter with the specified long name.</p> |
|  <p>[getStringParameter(parameterLongName)](./ts-command-line.commandlineparameterprovider.getstringparameter.md)</p> |  | <p>Returns the CommandLineStringParameter with the specified long name.</p> |
|  <p>[onDefineParameters()](./ts-command-line.commandlineparameterprovider.ondefineparameters.md)</p> |  | <p>The child class should implement this hook to define its command-line parameters, e.g. by calling defineFlagParameter().</p> |
|  <p>[renderHelpText()](./ts-command-line.commandlineparameterprovider.renderhelptext.md)</p> |  | <p>Generates the command-line help text.</p> |

