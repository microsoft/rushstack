<!-- docId=sp-webpart-base.iserializedserverprocesseddata.htmlstrings -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [ISerializedServerProcessedData](./sp-webpart-base.iserializedserverprocesseddata.md)

# ISerializedServerProcessedData.htmlStrings property

A key-value map where keys are string identifiers and values are rich text with HTML format. SharePoint servers treat the values as HTML content and run services like safety checks, search index and link fixup on them. Example: { 'myRichDescription': '&lt;div&gt;Some standard <b>HTML content</b><a href='http://somelink'>A Link</a></div>' 'anotherRichText': <div class='aClass'><span style='color:red'>Some red text</div> }

**Signature:**
```javascript
htmlStrings: { [key: string]: string }
```
