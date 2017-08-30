<!-- docId=sp-webpart-base.baseclientsidewebpart.getpropertypaneconfiguration -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.getPropertyPaneConfiguration method

This API is used to ger the configuration to build the property pane for the web part. If the web part wants to use the PropertyPane for configuration, this API needs to be overridden and the web part needs to return the configuration for the PropertyPane.see IPropertyPane and other PropertyPane integration wiki documentation for more details.

**Signature:**
```javascript
@virtual protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration;
```
**Returns:** `IPropertyPaneConfiguration`

