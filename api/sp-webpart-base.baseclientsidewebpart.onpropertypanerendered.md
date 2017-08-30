<!-- docId=sp-webpart-base.baseclientsidewebpart.onpropertypanerendered -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.onPropertyPaneRendered method

This API is invoked when the PropertyPane is rendered. From framework standpoint, we do not want to allow this event handler to be passed in, and trigger it. This api should be deprecated and then removed as part of refactoring.

**Signature:**
```javascript
@virtual protected onPropertyPaneRendered(): void;
```
**Returns:** `void`

