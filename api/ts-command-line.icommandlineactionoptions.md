[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [ICommandLineActionOptions](./ts-command-line.icommandlineactionoptions.md)

## ICommandLineActionOptions interface

Options for the CommandLineAction constructor.

<b>Signature:</b>

```typescript
export interface ICommandLineActionOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[actionName](./ts-command-line.icommandlineactionoptions.actionname.md)</p> | <p>`string`</p> | <p>The name of the action. For example, if the tool is called "example", then the "build" action might be invoked as: "example build -q --some-other-option"</p> |
|  <p>[documentation](./ts-command-line.icommandlineactionoptions.documentation.md)</p> | <p>`string`</p> | <p>A detailed description that is shown on the action help page, which is displayed by the command "example build --help", e.g. for actionName="build".</p> |
|  <p>[summary](./ts-command-line.icommandlineactionoptions.summary.md)</p> | <p>`string`</p> | <p>A quick summary that is shown on the main help page, which is displayed by the command "example --help"</p> |

