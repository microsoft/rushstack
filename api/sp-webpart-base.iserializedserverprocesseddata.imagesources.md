<!-- docId=sp-webpart-base.iserializedserverprocesseddata.imagesources -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [ISerializedServerProcessedData](./sp-webpart-base.iserializedserverprocesseddata.md)

# ISerializedServerProcessedData.imageSources property

A key-value map where keys are string identifiers and values are image sources. SharePoint servers treat the values as image sources and run services like search index and link fixup on them. Example: { 'myImage1': 'http://res.contoso.com/path/to/file' 'myImage2': 'https://res.contoso.com/someName.jpg' }

**Signature:**
```javascript
imageSources: { [key: string]: string }
```
