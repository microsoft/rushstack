[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md)

## ts-command-line package

An object-oriented command-line parser for TypeScript projects.

## Classes

|  Class | Description |
|  --- | --- |
|  [CommandLineAction](./ts-command-line.commandlineaction.md) | Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose. |
|  [CommandLineChoiceParameter](./ts-command-line.commandlinechoiceparameter.md) | The data type returned by [CommandLineParameterProvider.defineChoiceParameter()](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md)<!-- -->. |
|  [CommandLineFlagParameter](./ts-command-line.commandlineflagparameter.md) | The data type returned by [CommandLineParameterProvider.defineFlagParameter()](./ts-command-line.commandlineparameterprovider.defineflagparameter.md)<!-- -->. |
|  [CommandLineIntegerParameter](./ts-command-line.commandlineintegerparameter.md) | The data type returned by [CommandLineParameterProvider.defineIntegerParameter()](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md)<!-- -->. |
|  [CommandLineParameter](./ts-command-line.commandlineparameter.md) | The base class for the various command-line parameter types. |
|  [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) | This is the common base class for CommandLineAction and CommandLineParser that provides functionality for defining command-line parameters. |
|  [CommandLineParameterWithArgument](./ts-command-line.commandlineparameterwithargument.md) | The common base class for parameters types that receive an argument. |
|  [CommandLineParser](./ts-command-line.commandlineparser.md) | The "argparse" library is a relatively advanced command-line parser with features such as word-wrapping and intelligible error messages (that are lacking in other similar libraries such as commander, yargs, and nomnom). Unfortunately, its ruby-inspired API is awkward to use. The abstract base classes CommandLineParser and CommandLineAction provide a wrapper for "argparse" that makes defining and consuming arguments quick and simple, and enforces that appropriate documentation is provided for each parameter. |
|  [CommandLineStringListParameter](./ts-command-line.commandlinestringlistparameter.md) | The data type returned by [CommandLineParameterProvider.defineStringListParameter()](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md)<!-- -->. |
|  [CommandLineStringParameter](./ts-command-line.commandlinestringparameter.md) | The data type returned by [CommandLineParameterProvider.defineStringParameter()](./ts-command-line.commandlineparameterprovider.definestringparameter.md)<!-- -->. |
|  [DynamicCommandLineAction](./ts-command-line.dynamiccommandlineaction.md) |  |
|  [DynamicCommandLineParser](./ts-command-line.dynamiccommandlineparser.md) |  |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [CommandLineParameterKind](./ts-command-line.commandlineparameterkind.md) | Identifies the kind of a CommandLineParameter. |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [IBaseCommandLineDefinition](./ts-command-line.ibasecommandlinedefinition.md) | For use with CommandLineParser, this interface represents a generic command-line parameter |
|  [IBaseCommandLineDefinitionWithArgument](./ts-command-line.ibasecommandlinedefinitionwithargument.md) | The common base interface for parameter types that accept an argument. |
|  [ICommandLineActionOptions](./ts-command-line.icommandlineactionoptions.md) | Options for the CommandLineAction constructor. |
|  [ICommandLineChoiceDefinition](./ts-command-line.icommandlinechoicedefinition.md) | For use with CommandLineParser, this interface represents a parameter which is constrained to a list of possible options |
|  [ICommandLineFlagDefinition](./ts-command-line.icommandlineflagdefinition.md) | For use with CommandLineParser, this interface represents a command line parameter that is a boolean flag. |
|  [ICommandLineIntegerDefinition](./ts-command-line.icommandlineintegerdefinition.md) | For use with CommandLineParser, this interface represents a command line parameter whose argument is an integer value. |
|  [ICommandLineParserOptions](./ts-command-line.icommandlineparseroptions.md) | Options for the [CommandLineParser](./ts-command-line.commandlineparser.md) constructor. |
|  [ICommandLineStringDefinition](./ts-command-line.icommandlinestringdefinition.md) | For use with CommandLineParser, this interface represents a command line parameter whose argument is a string value. |
|  [ICommandLineStringListDefinition](./ts-command-line.icommandlinestringlistdefinition.md) | For use with CommandLineParser, this interface represents a command line parameter whose argument is a list of strings. |

