[Home](./index) &gt; [@microsoft/ts-command-line](ts-command-line.md) &gt; [CommandLineParameterProvider](ts-command-line.commandlineparameterprovider.md) &gt; [defineOptionParameter](ts-command-line.commandlineparameterprovider.defineoptionparameter.md)

# CommandLineParameterProvider.defineOptionParameter method

Defines a command-line parameter whose value must be a string from a fixed set of allowable choice (similar to an enum).

**Signature:**
```javascript
protected defineOptionParameter(definition: ICommandLineOptionDefinition): CommandLineOptionParameter;
```
**Returns:** `CommandLineOptionParameter`

## Remarks

Example: example-tool --log-level warn

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `definition` | `ICommandLineOptionDefinition` |  |

