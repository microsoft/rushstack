<!-- docId=sp-webpart-base.ipropertypanefield -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IPropertyPaneField interface

PropertyPane field.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`properties`](./sp-webpart-base.ipropertypanefield.properties.md) | `TProperties` | Strongly typed properties object. Specific to each field type. Example: Checkbox has ICheckboxProps, TextField has ITextField props. |
|  [`shouldFocus`](./sp-webpart-base.ipropertypanefield.shouldfocus.md) | `boolean` | Whether this control should be focused. default value is false. |
|  [`targetProperty`](./sp-webpart-base.ipropertypanefield.targetproperty.md) | `string` | Target property from the web part's property bag. |
|  [`type`](./sp-webpart-base.ipropertypanefield.type.md) | `PropertyPaneFieldType` | Type of the PropertyPane field. |

