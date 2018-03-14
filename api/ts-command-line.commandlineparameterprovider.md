[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md)

# CommandLineParameterProvider class

This is the common base class for CommandLineAction and CommandLineParser that provides functionality for defining command-line parameters.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor()`](./ts-command-line.commandlineparameterprovider.constructor.md) |  |  | Constructs a new instance of the [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) class |
|  [`defineFlagParameter(definition)`](./ts-command-line.commandlineparameterprovider.defineflagparameter.md) | `protected` | `CommandLineFlagParameter` | Defines a command-line switch whose boolean value is true if the switch is provided, and false otherwise. |
|  [`defineIntegerParameter(definition)`](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md) | `protected` | `CommandLineIntegerParameter` | Defines a command-line parameter whose value is an integer. |
|  [`defineOptionParameter(definition)`](./ts-command-line.commandlineparameterprovider.defineoptionparameter.md) | `protected` | `CommandLineOptionParameter` | Defines a command-line parameter whose value must be a string from a fixed set of allowable choice (similar to an enum). |
|  [`defineStringListParameter(definition)`](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md) | `protected` | `CommandLineStringListParameter` | Defines a command-line parameter whose value is one or more text strings. |
|  [`defineStringParameter(definition)`](./ts-command-line.commandlineparameterprovider.definestringparameter.md) | `protected` | `CommandLineStringParameter` | Defines a command-line parameter whose value is a single text string. |
|  [`onDefineParameters()`](./ts-command-line.commandlineparameterprovider.ondefineparameters.md) | `protected` | `void` | The child class should implement this hook to define its command-line parameters, e.g. by calling defineFlagParameter(). |

