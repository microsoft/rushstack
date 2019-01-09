[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md)

## ts-command-line package

An object-oriented command-line parser for TypeScript projects.

## Classes

|  <p>Class</p> | <p>Description</p> |
|  --- | --- |
|  <p>[CommandLineAction](./ts-command-line.commandlineaction.md)</p> | <p>Represents a sub-command that is part of the CommandLineParser command line. Applications should create subclasses of CommandLineAction corresponding to each action that they want to expose.</p> |
|  <p>[CommandLineChoiceParameter](./ts-command-line.commandlinechoiceparameter.md)</p> | <p>The data type returned by [CommandLineParameterProvider.defineChoiceParameter()](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md)<!-- -->.</p> |
|  <p>[CommandLineFlagParameter](./ts-command-line.commandlineflagparameter.md)</p> | <p>The data type returned by [CommandLineParameterProvider.defineFlagParameter()](./ts-command-line.commandlineparameterprovider.defineflagparameter.md)<!-- -->.</p> |
|  <p>[CommandLineIntegerParameter](./ts-command-line.commandlineintegerparameter.md)</p> | <p>The data type returned by [CommandLineParameterProvider.defineIntegerParameter()](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md)<!-- -->.</p> |
|  <p>[CommandLineParameter](./ts-command-line.commandlineparameter.md)</p> | <p>The base class for the various command-line parameter types.</p> |
|  <p>[CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md)</p> | <p>This is the common base class for CommandLineAction and CommandLineParser that provides functionality for defining command-line parameters.</p> |
|  <p>[CommandLineParameterWithArgument](./ts-command-line.commandlineparameterwithargument.md)</p> | <p>The common base class for parameters types that receive an argument.</p> |
|  <p>[CommandLineParser](./ts-command-line.commandlineparser.md)</p> | <p>The "argparse" library is a relatively advanced command-line parser with features such as word-wrapping and intelligible error messages (that are lacking in other similar libraries such as commander, yargs, and nomnom). Unfortunately, its ruby-inspired API is awkward to use. The abstract base classes CommandLineParser and CommandLineAction provide a wrapper for "argparse" that makes defining and consuming arguments quick and simple, and enforces that appropriate documentation is provided for each parameter.</p> |
|  <p>[CommandLineStringListParameter](./ts-command-line.commandlinestringlistparameter.md)</p> | <p>The data type returned by [CommandLineParameterProvider.defineStringListParameter()](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md)<!-- -->.</p> |
|  <p>[CommandLineStringParameter](./ts-command-line.commandlinestringparameter.md)</p> | <p>The data type returned by [CommandLineParameterProvider.defineStringParameter()](./ts-command-line.commandlineparameterprovider.definestringparameter.md)<!-- -->.</p> |
|  <p>[DynamicCommandLineAction](./ts-command-line.dynamiccommandlineaction.md)</p> | <p></p> |
|  <p>[DynamicCommandLineParser](./ts-command-line.dynamiccommandlineparser.md)</p> | <p></p> |

## Enumerations

|  <p>Enumeration</p> | <p>Description</p> |
|  --- | --- |
|  <p>[CommandLineParameterKind](./ts-command-line.commandlineparameterkind.md)</p> | <p>Identifies the kind of a CommandLineParameter.</p> |

## Interfaces

|  <p>Interface</p> | <p>Description</p> |
|  --- | --- |
|  <p>[IBaseCommandLineDefinition](./ts-command-line.ibasecommandlinedefinition.md)</p> | <p>For use with CommandLineParser, this interface represents a generic command-line parameter</p> |
|  <p>[IBaseCommandLineDefinitionWithArgument](./ts-command-line.ibasecommandlinedefinitionwithargument.md)</p> | <p>The common base interface for parameter types that accept an argument.</p> |
|  <p>[ICommandLineActionOptions](./ts-command-line.icommandlineactionoptions.md)</p> | <p>Options for the CommandLineAction constructor.</p> |
|  <p>[ICommandLineChoiceDefinition](./ts-command-line.icommandlinechoicedefinition.md)</p> | <p>For use with CommandLineParser, this interface represents a parameter which is constrained to a list of possible options</p> |
|  <p>[ICommandLineFlagDefinition](./ts-command-line.icommandlineflagdefinition.md)</p> | <p>For use with CommandLineParser, this interface represents a command line parameter that is a boolean flag.</p> |
|  <p>[ICommandLineIntegerDefinition](./ts-command-line.icommandlineintegerdefinition.md)</p> | <p>For use with CommandLineParser, this interface represents a command line parameter whose argument is an integer value.</p> |
|  <p>[ICommandLineParserOptions](./ts-command-line.icommandlineparseroptions.md)</p> | <p>Options for the [CommandLineParser](./ts-command-line.commandlineparser.md) constructor.</p> |
|  <p>[ICommandLineStringDefinition](./ts-command-line.icommandlinestringdefinition.md)</p> | <p>For use with CommandLineParser, this interface represents a command line parameter whose argument is a string value.</p> |
|  <p>[ICommandLineStringListDefinition](./ts-command-line.icommandlinestringlistdefinition.md)</p> | <p>For use with CommandLineParser, this interface represents a command line parameter whose argument is a list of strings.</p> |

