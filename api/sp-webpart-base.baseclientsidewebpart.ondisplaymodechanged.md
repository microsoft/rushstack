<!-- docId=sp-webpart-base.baseclientsidewebpart.ondisplaymodechanged -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onDisplayModeChanged method

This API is called when the display mode of a web part is changed. The default implementation of this API calls the web part render method to re-render the web part with the new display mode. If a web part developer does not want a full re-render to happen on display mode change, they can override this API and perform specific updates to the web part DOM to switch its display mode.

**Signature:**
```javascript
@virtual protected onDisplayModeChanged(oldDisplayMode: DisplayMode): void;
```
**Returns:** `void`


## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `oldDisplayMode` | `DisplayMode` | The old display mode. |

