<!-- docId=sp-webpart-base.ipropertypaneaccessor.isrenderedbywebpart -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [IPropertyPaneAccessor](./sp-webpart-base.ipropertypaneaccessor.md)

# IPropertyPaneAccessor.isRenderedByWebPart method

Indicates whether the PropertyPane was initially opened by the web part. For example, if the web part calls this.context.propertyPane.open() then the property would be true, whereas if the property pane was opened by the host, then the value will be false.

**Signature:**
```javascript
isRenderedByWebPart(): boolean;
```
**Returns:** `boolean`

