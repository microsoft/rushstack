<!-- docId=sp-webpart-base.iserializedserverprocesseddata.searchableplaintexts -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [ISerializedServerProcessedData](./sp-webpart-base.iserializedserverprocesseddata.md)

# ISerializedServerProcessedData.searchablePlainTexts property

A key-value map where keys are string identifiers and values are strings that should be search indexed. The values are html-encoded before being sent to the server. The encoded values are visible to the search indexer, but are not treated as valid html. So, other services such as link fixup will not run on them. Example: { 'justSomeText': 'This is some plain text', 'anotherText': 'Can have &lt;any&gt; characters here: "<>&amp;\\'' }

**Signature:**
```javascript
searchablePlainTexts: { [key: string]: string }
```
