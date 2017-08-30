<!-- docId=sp-webpart-base.baseclientsidewebpart.previewimageurl -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.previewImageUrl property

This property points to the preview image for the web part. The base implementation returns undefined. Web parts that want to provide a valid preview image url need to override this API. The preview image url can be used to create a preview of the web part or of the page on which the web part is present.

**Signature:**
```javascript
previewImageUrl: string | undefined
```
