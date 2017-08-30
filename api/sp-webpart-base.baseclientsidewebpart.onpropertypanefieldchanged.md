<!-- docId=sp-webpart-base.baseclientsidewebpart.onpropertypanefieldchanged -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onPropertyPaneFieldChanged method

This API is invoked after updating the new value of the property in the property bag when the PropertyPane is being used in Reactive mode.

**Signature:**
```javascript
@virtual protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: any, newValue: any): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `propertyPath` | `string` | JSON path of the property in the property bag. In the case of custom field, if no target property is provided then a custom value is assigned, which will be in the form of '\_\_CustomField\_&lt;key provided when the custom field is created&gt;'. |
|  `oldValue` | `any` | Old value of the property. This value could be undefined/empty in the case of custom field. |
|  `newValue` | `any` | New value of the property. This value could be undefined/empty in the case of custom field. |

