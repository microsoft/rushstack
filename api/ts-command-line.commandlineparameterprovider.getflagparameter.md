[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [getFlagParameter](./ts-command-line.commandlineparameterprovider.getflagparameter.md)

## CommandLineParameterProvider.getFlagParameter() method

Returns the CommandLineFlagParameter with the specified long name.

<b>Signature:</b>

```typescript
getFlagParameter(parameterLongName: string): CommandLineFlagParameter;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  parameterLongName | `string` |  |

<b>Returns:</b>

`CommandLineFlagParameter`

## Remarks

This method throws an exception if the parameter is not defined.

