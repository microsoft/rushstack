<!-- docId=sp-webpart-base.iserializedserverprocesseddata -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# ISerializedServerProcessedData interface

Contains collections of data that can be processed by server side services like search index and link fixup

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`htmlStrings`](./sp-webpart-base.iserializedserverprocesseddata.htmlstrings.md) | `{ [key: string]: string }` | A key-value map where keys are string identifiers and values are rich text with HTML format. SharePoint servers treat the values as HTML content and run services like safety checks, search index and link fixup on them. Example: { 'myRichDescription': '&lt;div&gt;Some standard <b>HTML content</b><a href='http://somelink'>A Link</a></div>' 'anotherRichText': <div class='aClass'><span style='color:red'>Some red text</div> } |
|  [`imageSources`](./sp-webpart-base.iserializedserverprocesseddata.imagesources.md) | `{ [key: string]: string }` | A key-value map where keys are string identifiers and values are image sources. SharePoint servers treat the values as image sources and run services like search index and link fixup on them. Example: { 'myImage1': 'http://res.contoso.com/path/to/file' 'myImage2': 'https://res.contoso.com/someName.jpg' } |
|  [`links`](./sp-webpart-base.iserializedserverprocesseddata.links.md) | `{ [key: string]: string }` | A key-value map where keys are string identifiers and values are links. SharePoint servers treat the values as links and run services like link fixup on them. Example: { 'myWebURL': 'http://contoso.com' 'myFileLink': 'https://res.contoso.com/file.docx' } |
|  [`searchablePlainTexts`](./sp-webpart-base.iserializedserverprocesseddata.searchableplaintexts.md) | `{ [key: string]: string }` | A key-value map where keys are string identifiers and values are strings that should be search indexed. The values are html-encoded before being sent to the server. The encoded values are visible to the search indexer, but are not treated as valid html. So, other services such as link fixup will not run on them. Example: { 'justSomeText': 'This is some plain text', 'anotherText': 'Can have &lt;any&gt; characters here: "<>&amp;\\'' } |

