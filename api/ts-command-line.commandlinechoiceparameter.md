[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineChoiceParameter](./ts-command-line.commandlinechoiceparameter.md)

## CommandLineChoiceParameter class

The data type returned by [CommandLineParameterProvider.defineChoiceParameter()](./ts-command-line.commandlineparameterprovider.definechoiceparameter.md)<!-- -->.

<b>Signature:</b>

```typescript
export declare class CommandLineChoiceParameter extends CommandLineParameter 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[alternatives](./ts-command-line.commandlinechoiceparameter.alternatives.md)</p> |  | <p>`ReadonlyArray<string>`</p> | <p></p> |
|  <p>[defaultValue](./ts-command-line.commandlinechoiceparameter.defaultvalue.md)</p> |  | <p>`string | undefined`</p> | <p></p> |
|  <p>[kind](./ts-command-line.commandlinechoiceparameter.kind.md)</p> |  | <p>`CommandLineParameterKind`</p> | <p></p> |
|  <p>[value](./ts-command-line.commandlinechoiceparameter.value.md)</p> |  | <p>`string | undefined`</p> | <p>Returns the argument value for a choice parameter that was parsed from the command line.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[appendToArgList(argList)](./ts-command-line.commandlinechoiceparameter.appendtoarglist.md)</p> |  | <p></p> |

