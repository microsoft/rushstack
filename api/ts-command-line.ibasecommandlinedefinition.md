[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [IBaseCommandLineDefinition](./ts-command-line.ibasecommandlinedefinition.md)

## IBaseCommandLineDefinition interface

For use with CommandLineParser, this interface represents a generic command-line parameter

<b>Signature:</b>

```typescript
export interface IBaseCommandLineDefinition 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [description](./ts-command-line.ibasecommandlinedefinition.description.md) | `string` | Documentation for the flag, that will be shown when invoking the tool with "--help" |
|  [environmentVariable](./ts-command-line.ibasecommandlinedefinition.environmentvariable.md) | `string` | The name of an environment variable that the parameter value will be read from, if it was omitted from the command-line. An error will be reported if the environment value cannot be parsed. |
|  [parameterLongName](./ts-command-line.ibasecommandlinedefinition.parameterlongname.md) | `string` | The long name of the flag including double dashes, e.g. "--do-something" |
|  [parameterShortName](./ts-command-line.ibasecommandlinedefinition.parametershortname.md) | `string` | An optional short name for the flag including the dash, e.g. "-d" |
|  [required](./ts-command-line.ibasecommandlinedefinition.required.md) | `boolean` | If true, then an error occurs if the parameter was not included on the command-line. |

