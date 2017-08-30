<!-- docId=sp-webpart-base.baseclientsidewebpart.onpropertypaneconfigurationcomplete -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onPropertyPaneConfigurationComplete method

This API is invoked when the configuration is completed on the PropertyPane. It's invoked in the following cases: - When the CONFIGURATION\_COMPLETE\_TIMEOUT((currently the value is 5 secs) elapses after the last change. - When user clicks 'x'(close) button before the CONFIGURATION\_COMPLETE\_TIMEOUT elapses. - When user clciks 'Apply' button before the CONFIGURATION\_COMPLETE\_TIMEOUT elapses. - When the user switches web parts then the current web part gets this event.

**Signature:**
```javascript
@virtual protected onPropertyPaneConfigurationComplete(): void;
```
**Returns:** `void`

