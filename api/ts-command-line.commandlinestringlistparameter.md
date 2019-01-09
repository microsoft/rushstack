[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineStringListParameter](./ts-command-line.commandlinestringlistparameter.md)

## CommandLineStringListParameter class

The data type returned by [CommandLineParameterProvider.defineStringListParameter()](./ts-command-line.commandlineparameterprovider.definestringlistparameter.md)<!-- -->.

<b>Signature:</b>

```typescript
export declare class CommandLineStringListParameter extends CommandLineParameterWithArgument 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [kind](./ts-command-line.commandlinestringlistparameter.kind.md) |  | `CommandLineParameterKind` |  |
|  [values](./ts-command-line.commandlinestringlistparameter.values.md) |  | `ReadonlyArray<string>` | Returns the string arguments for a string list parameter that was parsed from the command line. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [appendToArgList(argList)](./ts-command-line.commandlinestringlistparameter.appendtoarglist.md) |  |  |

