<!-- docId=sp-webpart-base.ipropertypaneaccessor.refresh -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [IPropertyPaneAccessor](./sp-webpart-base.ipropertypaneaccessor.md)

# IPropertyPaneAccessor.refresh method

This API should be used to invoke the PropertyPane to help configure the web part. This operation only works when the PropertyPane is already open for the currently active web part. If the PropertyPane is opened for another web part, calling the refresh API will have no impact.

**Signature:**
```javascript
refresh(): void;
```
**Returns:** `void`

