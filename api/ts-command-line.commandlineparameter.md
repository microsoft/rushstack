[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameter](./ts-command-line.commandlineparameter.md)

## CommandLineParameter class

The base class for the various command-line parameter types.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineParameter 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [description](./ts-command-line.commandlineparameter.description.md) |  | `string` |  |
|  [environmentVariable](./ts-command-line.commandlineparameter.environmentvariable.md) |  | `string | undefined` |  |
|  [kind](./ts-command-line.commandlineparameter.kind.md) |  | `CommandLineParameterKind` | Indicates the type of parameter. |
|  [longName](./ts-command-line.commandlineparameter.longname.md) |  | `string` |  |
|  [required](./ts-command-line.commandlineparameter.required.md) |  | `boolean` |  |
|  [shortName](./ts-command-line.commandlineparameter.shortname.md) |  | `string | undefined` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [appendToArgList(argList)](./ts-command-line.commandlineparameter.appendtoarglist.md) |  | Append the parsed values to the provided string array. |
|  [reportInvalidData(data)](./ts-command-line.commandlineparameter.reportinvaliddata.md) |  | Internal usage only. Used to report unexpected output from the argparse library. |
|  [validateDefaultValue(hasDefaultValue)](./ts-command-line.commandlineparameter.validatedefaultvalue.md) |  |  |

