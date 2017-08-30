<!-- docId=sp-webpart-base.baseclientsidewebpart.rendercompleted -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.renderCompleted method

This API should be called by web parts that perform Async rendering. Those web part are required to override the isRenderAsync API and return true. One such example is web parts that render content in an IFrame. The web part initiates the IFrame rendering in the render() API but the actual rendering is complete only after the iframe loading completes.

**Signature:**
```javascript
protected renderCompleted(): void;
```
**Returns:** `void`

