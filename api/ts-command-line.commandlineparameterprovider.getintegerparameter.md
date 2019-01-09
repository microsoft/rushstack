[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [getIntegerParameter](./ts-command-line.commandlineparameterprovider.getintegerparameter.md)

## CommandLineParameterProvider.getIntegerParameter() method

Returns the CommandLineIntegerParameter with the specified long name.

<b>Signature:</b>

```typescript
getIntegerParameter(parameterLongName: string): CommandLineIntegerParameter;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  parameterLongName | `string` |  |

<b>Returns:</b>

`CommandLineIntegerParameter`

## Remarks

This method throws an exception if the parameter is not defined.

