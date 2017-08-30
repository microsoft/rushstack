<!-- docId=sp-webpart-base.iserializedserverprocesseddata.links -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [ISerializedServerProcessedData](./sp-webpart-base.iserializedserverprocesseddata.md)

# ISerializedServerProcessedData.links property

A key-value map where keys are string identifiers and values are links. SharePoint servers treat the values as links and run services like link fixup on them. Example: { 'myWebURL': 'http://contoso.com' 'myFileLink': 'https://res.contoso.com/file.docx' }

**Signature:**
```javascript
links: { [key: string]: string }
```
