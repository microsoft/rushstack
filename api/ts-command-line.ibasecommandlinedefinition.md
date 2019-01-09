[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [IBaseCommandLineDefinition](./ts-command-line.ibasecommandlinedefinition.md)

## IBaseCommandLineDefinition interface

For use with CommandLineParser, this interface represents a generic command-line parameter

<b>Signature:</b>

```typescript
export interface IBaseCommandLineDefinition 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[description](./ts-command-line.ibasecommandlinedefinition.description.md)</p> | <p>`string`</p> | <p>Documentation for the flag, that will be shown when invoking the tool with "--help"</p> |
|  <p>[environmentVariable](./ts-command-line.ibasecommandlinedefinition.environmentvariable.md)</p> | <p>`string`</p> | <p>The name of an environment variable that the parameter value will be read from, if it was omitted from the command-line. An error will be reported if the environment value cannot be parsed.</p> |
|  <p>[parameterLongName](./ts-command-line.ibasecommandlinedefinition.parameterlongname.md)</p> | <p>`string`</p> | <p>The long name of the flag including double dashes, e.g. "--do-something"</p> |
|  <p>[parameterShortName](./ts-command-line.ibasecommandlinedefinition.parametershortname.md)</p> | <p>`string`</p> | <p>An optional short name for the flag including the dash, e.g. "-d"</p> |
|  <p>[required](./ts-command-line.ibasecommandlinedefinition.required.md)</p> | <p>`boolean`</p> | <p>If true, then an error occurs if the parameter was not included on the command-line.</p> |

