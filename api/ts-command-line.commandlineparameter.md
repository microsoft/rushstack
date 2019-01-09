[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameter](./ts-command-line.commandlineparameter.md)

## CommandLineParameter class

The base class for the various command-line parameter types.

<b>Signature:</b>

```typescript
export declare abstract class CommandLineParameter 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[description](./ts-command-line.commandlineparameter.description.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[environmentVariable](./ts-command-line.commandlineparameter.environmentvariable.md)</p> |  | <p>`string | undefined`</p> | <p></p> |
|  <p>[kind](./ts-command-line.commandlineparameter.kind.md)</p> |  | <p>`CommandLineParameterKind`</p> | <p>Indicates the type of parameter.</p> |
|  <p>[longName](./ts-command-line.commandlineparameter.longname.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[required](./ts-command-line.commandlineparameter.required.md)</p> |  | <p>`boolean`</p> | <p></p> |
|  <p>[shortName](./ts-command-line.commandlineparameter.shortname.md)</p> |  | <p>`string | undefined`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[appendToArgList(argList)](./ts-command-line.commandlineparameter.appendtoarglist.md)</p> |  | <p>Append the parsed values to the provided string array.</p> |
|  <p>[reportInvalidData(data)](./ts-command-line.commandlineparameter.reportinvaliddata.md)</p> |  | <p>Internal usage only. Used to report unexpected output from the argparse library.</p> |
|  <p>[validateDefaultValue(hasDefaultValue)](./ts-command-line.commandlineparameter.validatedefaultvalue.md)</p> |  |  |

