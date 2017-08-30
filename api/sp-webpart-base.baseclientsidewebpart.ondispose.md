<!-- docId=sp-webpart-base.baseclientsidewebpart.ondispose -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onDispose method

This API should be used to refresh the contents of the PropertyPane. This API is called at the end of the web part lifecycle on a page. It should be used to dispose any local resources (i.e. DOM elements) that the web part is holding onto. This API is expected to be called in scenarios like page navigation i.e. the host is transitioning from one page to another and disposes the page that is being transitioned out.

**Signature:**
```javascript
@virtual protected onDispose(): void;
```
**Returns:** `void`

