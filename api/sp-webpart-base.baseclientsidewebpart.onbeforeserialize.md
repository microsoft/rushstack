<!-- docId=sp-webpart-base.baseclientsidewebpart.onbeforeserialize -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onBeforeSerialize method

This API is called before the web part is serialized. The default implementation is a no-op. The serialization process serializes the web part property bag i.e. this.properties. This API gives the web part a chance to update it's property bag before the serialization happens. Some web part's may keep their state other objects or even in the DOM. If a web part needs to persist some of that state, it needs to override this API and update the web part property bag to the latest state. If a web part updates the property bag with invalid property values, those will get persisted. So that should be avoided. The web part property bag should always contain valid property values.

**Signature:**
```javascript
@virtual protected onBeforeSerialize(): void;
```
**Returns:** `void`

