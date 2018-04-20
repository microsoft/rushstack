[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [getFlagParameter](./ts-command-line.commandlineparameterprovider.getflagparameter.md)

# CommandLineParameterProvider.getFlagParameter method

Returns the CommandLineFlagParameter with the specified long name.

**Signature:**
```javascript
getFlagParameter(parameterLongName: string): CommandLineFlagParameter;
```
**Returns:** `CommandLineFlagParameter`

## Remarks

This method throws an exception if the parameter is not defined.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `parameterLongName` | `string` |  |

