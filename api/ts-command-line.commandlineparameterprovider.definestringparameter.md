[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameterProvider](./ts-command-line.commandlineparameterprovider.md) &gt; [defineStringParameter](./ts-command-line.commandlineparameterprovider.definestringparameter.md)

## CommandLineParameterProvider.defineStringParameter() method

Defines a command-line parameter whose value is a single text string.

<b>Signature:</b>

```typescript
defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>definition</p> | <p>`ICommandLineStringDefinition`</p> |  |

<b>Returns:</b>

`CommandLineStringParameter`

## Remarks

Example: example-tool --message "Hello, world!"

