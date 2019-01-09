[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [IBaseCommandLineDefinitionWithArgument](./ts-command-line.ibasecommandlinedefinitionwithargument.md)

## IBaseCommandLineDefinitionWithArgument interface

The common base interface for parameter types that accept an argument.

<b>Signature:</b>

```typescript
export interface IBaseCommandLineDefinitionWithArgument extends IBaseCommandLineDefinition 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[argumentName](./ts-command-line.ibasecommandlinedefinitionwithargument.argumentname.md)</p> | <p>`string`</p> | <p>The name of the argument, which will be shown in the command-line help.</p> |

## Remarks

An argument is an accompanying command-line token, such as "123" in the example "--max-count 123".

