[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [defineFlagParameter](./ts-command-line.commandlineparameterprovider.defineflagparameter.md)

## CommandLineParameterProvider.defineFlagParameter() method

Defines a command-line switch whose boolean value is true if the switch is provided, and false otherwise.

<b>Signature:</b>

```typescript
defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>definition</p> | <p>`ICommandLineFlagDefinition`</p> |  |

<b>Returns:</b>

`CommandLineFlagParameter`

## Remarks

Example: example-tool --debug

