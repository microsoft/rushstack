[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [getStringListParameter](./ts-command-line.commandlineparameterprovider.getstringlistparameter.md)

## CommandLineParameterProvider.getStringListParameter() method

Returns the CommandLineStringListParameter with the specified long name.

<b>Signature:</b>

```typescript
getStringListParameter(parameterLongName: string): CommandLineStringListParameter;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>parameterLongName</p> | <p>`string`</p> |  |

<b>Returns:</b>

`CommandLineStringListParameter`

## Remarks

This method throws an exception if the parameter is not defined.

