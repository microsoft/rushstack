<!-- docId=sp-webpart-base.iwebpartpropertiesmetadata -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IWebPartPropertiesMetadata interface

This structure is used to define metadata for web part propeties as a map of string to IWebPartPropertyMetadata The key should be a json path to the property in web part propeties. The json path supports the following operators: - Dot . for selecting object members e.g. person.name - Brackets \[\] for selecting array items e.g. person.photoURLs\[0\] - Bracketed asterisk \[\*\] for array elements wildcard e.g. person.websites\[\*\]. You can make combinations of these operators e.g. person.websites\[\*\].url Important Note: Only one wildcard per path is supported. Example: Let's assume we have a web part with properties that have the following schema: { title: string; person: { name: string; bio: string; photoURLs: string\[\]; websites: { title: string; url: string; }\[\] } } We can define the metadata for the desired properties as following: { 'person.bio': { isRichContent: true }, 'person.photoURLs\[\*\]': { isImageSource: true }, 'person.websites\[\*\].url': { isLink: true } } This will make SharePoint servers aware of the content of your properties and run services such as search indexing, link fix-up, etc on the data. In case any of the values needs to update by these services, e.g link fix-up, the web part property bag is automatically updated.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`__index()`](./sp-webpart-base.iwebpartpropertiesmetadata.__index.md) | `IWebPartPropertyMetadata` |  |

