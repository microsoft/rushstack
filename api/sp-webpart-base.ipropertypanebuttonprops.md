<!-- docId=sp-webpart-base.ipropertypanebuttonprops -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IPropertyPaneButtonProps interface

PropertyPane button props.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`ariaDescription`](./sp-webpart-base.ipropertypanebuttonprops.ariadescription.md) | `string` | Detailed description of the button for the benefit of screen readers. Besides the compound button, other button types will need more information provided to screen reader. |
|  [`ariaLabel`](./sp-webpart-base.ipropertypanebuttonprops.arialabel.md) | `string` | The aria label of the button for the benefit of screen readers. |
|  [`buttonType`](./sp-webpart-base.ipropertypanebuttonprops.buttontype.md) | `PropertyPaneButtonType` | The type of button to render. Default value is ButtonType.normal. |
|  [`description`](./sp-webpart-base.ipropertypanebuttonprops.description.md) | `string` | Description of the action this button takes. Only used for compound buttons. |
|  [`disabled`](./sp-webpart-base.ipropertypanebuttonprops.disabled.md) | `boolean` | Whether the button is disabled. |
|  [`icon`](./sp-webpart-base.ipropertypanebuttonprops.icon.md) | `string` | The button icon shown in command or hero type. |
|  [`onClick`](./sp-webpart-base.ipropertypanebuttonprops.onclick.md) | `(value: any) => any` | A callback which is invoked on the button click, which takes in the existing value for the bound property and returns the new value and which is then used to update the properties bag. This update will result in the re-render of the PropertyPane with the new props. |
|  [`text`](./sp-webpart-base.ipropertypanebuttonprops.text.md) | `string` | Display text of the element. |

