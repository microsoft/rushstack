[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [ICommandLineChoiceDefinition](./ts-command-line.icommandlinechoicedefinition.md)

# ICommandLineChoiceDefinition interface

For use with CommandLineParser, this interface represents a parameter which is constrained to a list of possible options

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`alternatives`](./ts-command-line.icommandlinechoicedefinition.alternatives.md) | `string[]` | A list of strings (which contain no spaces), of possible options which can be selected |
|  [`defaultValue`](./ts-command-line.icommandlinechoicedefinition.defaultvalue.md) | `string` | The default value which will be used if the parameter is omitted from the command line |

