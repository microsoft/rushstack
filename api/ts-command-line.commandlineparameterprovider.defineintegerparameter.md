[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [defineIntegerParameter](./ts-command-line.commandlineparameterprovider.defineintegerparameter.md)

## CommandLineParameterProvider.defineIntegerParameter() method

Defines a command-line parameter whose value is an integer.

<b>Signature:</b>

```typescript
defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  definition | `ICommandLineIntegerDefinition` |  |

<b>Returns:</b>

`CommandLineIntegerParameter`

## Remarks

Example: example-tool --max-attempts 5

