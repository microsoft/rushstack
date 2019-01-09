[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [getStringParameter](./ts-command-line.commandlineparameterprovider.getstringparameter.md)

## CommandLineParameterProvider.getStringParameter() method

Returns the CommandLineStringParameter with the specified long name.

<b>Signature:</b>

```typescript
getStringParameter(parameterLongName: string): CommandLineStringParameter;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  parameterLongName | `string` |  |

<b>Returns:</b>

`CommandLineStringParameter`

## Remarks

This method throws an exception if the parameter is not defined.

