<!-- docId=sp-webpart-base.propertypanecustomfield -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# PropertyPaneCustomField function

> This API is provided as a preview for developers and may change based on feedback that we receive.  Do not use this API in a production environment.

Helper method to create a custom field on the PropertyPane. The purpose of the custom field is to help the web part developer to add a custom control to the PropertyPane. The PropertyPane supports a host of inbuilt field types. While this list meets the demands of most web parts, but there are exceptional cases when web parts have special needs and need a special control. The custom field helps fill that gap.

**Signature:**
```javascript
PropertyPaneCustomField
```
**Returns:** `IPropertyPaneField<IPropertyPaneCustomFieldProps>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `targetProperty` |  | target property for this field. This parameter is being deprecated in future releases. |
|  `properties` | `IPropertyPaneCustomFieldProps` | Strongly typed Custom field properties. |

