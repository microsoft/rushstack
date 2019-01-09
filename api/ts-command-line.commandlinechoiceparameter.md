[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineChoiceParameter](./ts-command-line.commandlinechoiceparameter.md)

## CommandLineChoiceParameter class

The data type returned by [CommandLineParameterProvider.defineChoiceParameter()](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md)<!-- -->.

<b>Signature:</b>

```typescript
export declare class CommandLineChoiceParameter extends CommandLineParameter 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [alternatives](./ts-command-line.commandlinechoiceparameter.alternatives.md) |  | `ReadonlyArray<string>` |  |
|  [defaultValue](./ts-command-line.commandlinechoiceparameter.defaultvalue.md) |  | `string | undefined` |  |
|  [kind](./ts-command-line.commandlinechoiceparameter.kind.md) |  | `CommandLineParameterKind` |  |
|  [value](./ts-command-line.commandlinechoiceparameter.value.md) |  | `string | undefined` | Returns the argument value for a choice parameter that was parsed from the command line. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [appendToArgList(argList)](./ts-command-line.commandlinechoiceparameter.appendtoarglist.md) |  |  |

