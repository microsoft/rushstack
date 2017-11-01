[Home](./index) &gt; [@microsoft/ts-command-line](ts-command-line.md)

# ts-command-line package

An object-oriented command-line parser for TypeScript projects.

## Classes

|  Class | Description |
|  --- | --- |
|  [`CommandLineAction`](ts-command-line.commandlineaction.md) | Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose. |
|  [`CommandLineFlagParameter`](ts-command-line.commandlineflagparameter.md) | The data type returned by [CommandLineParameterProvider.defineFlagParameter](ts-command-line.commandlineparameterprovider.defineflagparameter.md)<!-- -->. |
|  [`CommandLineIntegerParameter`](ts-command-line.commandlineintegerparameter.md) | The data type returned by [CommandLineParameterProvider.defineIntegerParameter](ts-command-line.commandlineparameterprovider.defineintegerparameter.md)<!-- -->. |
|  [`CommandLineOptionParameter`](ts-command-line.commandlineoptionparameter.md) | The data type returned by [CommandLineParameterProvider.defineOptionParameter](ts-command-line.commandlineparameterprovider.defineoptionparameter.md)<!-- -->. |
|  [`CommandLineParameter`](ts-command-line.commandlineparameter.md) | The base class for the various command-line parameter types. |
|  [`CommandLineParameterProvider`](ts-command-line.commandlineparameterprovider.md) | This is the common base class for CommandLineAction and CommandLineParser that provides functionality for defining command-line parameters. |
|  [`CommandLineParser`](ts-command-line.commandlineparser.md) | The "argparse" library is a relatively advanced command-line parser with features such as word-wrapping and intelligible error messages (that are lacking in other similar libraries such as commander, yargs, and nomnom). Unfortunately, its ruby-inspired API is awkward to use. The abstract base classes CommandLineParser and CommandLineAction provide a wrapper for "argparse" that makes defining and consuming arguments quick and simple, and enforces that appropriate documentation is provided for each parameter. |
|  [`CommandLineStringListParameter`](ts-command-line.commandlinestringlistparameter.md) | The data type returned by [CommandLineParameterProvider.defineStringListParameter](ts-command-line.commandlineparameterprovider.definestringlistparameter.md)<!-- -->. |
|  [`CommandLineStringParameter`](ts-command-line.commandlinestringparameter.md) | The data type returned by [CommandLineParameterProvider.defineStringParameter](ts-command-line.commandlineparameterprovider.definestringparameter.md)<!-- -->. |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [`IBaseCommandLineDefinition`](ts-command-line.ibasecommandlinedefinition.md) | For use with CommandLineParser, this interface represents a generic command-line parameter |
|  [`ICommandLineActionOptions`](ts-command-line.icommandlineactionoptions.md) | Options for the CommandLineAction constructor. |
|  [`ICommandLineFlagDefinition`](ts-command-line.icommandlineflagdefinition.md) | For use with CommandLineParser, this interface represents a boolean flag command line parameter |
|  [`ICommandLineIntegerDefinition`](ts-command-line.icommandlineintegerdefinition.md) | For use with CommandLineParser, this interface represents an integer command line parameter |
|  [`ICommandLineOptionDefinition`](ts-command-line.icommandlineoptiondefinition.md) | For use with CommandLineParser, this interface represents a parameter which is constrained to a list of possible options |
|  [`ICommandLineStringDefinition`](ts-command-line.icommandlinestringdefinition.md) | For use with CommandLineParser, this interface represents a string command line parameter |
|  [`ICommandLineStringListDefinition`](ts-command-line.icommandlinestringlistdefinition.md) | For use with CommandLineParser, this interface represents a string command line parameter |
|  [`ICommandListParserOptions`](ts-command-line.icommandlistparseroptions.md) | Options for the [CommandLineParser](ts-command-line.commandlineparser.md) constructor. |

