[Home](./index) &gt; [@microsoft/ts-command-line](ts-command-line.md) &gt; [CommandLineParameterProvider](ts-command-line.commandlineparameterprovider.md) &gt; [defineFlagParameter](ts-command-line.commandlineparameterprovider.defineflagparameter.md)

# CommandLineParameterProvider.defineFlagParameter method

Defines a command-line switch whose boolean value is true if the switch is provided, and false otherwise.

**Signature:**
```javascript
protected defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter;
```
**Returns:** `CommandLineFlagParameter`

## Remarks

Example: example-tool --debug

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `definition` | `ICommandLineFlagDefinition` |  |

