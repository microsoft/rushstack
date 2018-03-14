[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [IBaseCommandLineDefinition](./ts-command-line.ibasecommandlinedefinition.md)

# IBaseCommandLineDefinition interface

For use with CommandLineParser, this interface represents a generic command-line parameter

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`description`](./ts-command-line.ibasecommandlinedefinition.description.md) | `string` | Documentation for the flag, that will be shown when invoking the tool with "--help" |
|  [`parameterLongName`](./ts-command-line.ibasecommandlinedefinition.parameterlongname.md) | `string` | The long name of the flag including double dashes, e.g. "--do-something" |
|  [`parameterShortName`](./ts-command-line.ibasecommandlinedefinition.parametershortname.md) | `string` | An optional short name for the flag including the dash, e.g. "-d" |

