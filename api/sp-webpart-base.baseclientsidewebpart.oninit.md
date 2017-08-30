<!-- docId=sp-webpart-base.baseclientsidewebpart.oninit -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onInit method

This API should be overridden to perform long running operations e.g. data fetching from a remote service before the initial rendering of the web part. The loading indicator is displayed during the lifetime of this method. This API is called only once during the lifecycle of a web part.

**Signature:**
```javascript
@virtual protected onInit(): Promise<void>;
```
**Returns:** `Promise<void>`

