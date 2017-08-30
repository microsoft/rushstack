<!-- docId=sp-webpart-base.iserializedwebpartdata -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# ISerializedWebPartData interface

This structure represents the part of the serialized state of a web part which is controlled by the web part. It is extended by IWebPartData which contains additional data added by the framework to the serialized data.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`dataVersion`](./sp-webpart-base.iserializedwebpartdata.dataversion.md) | `Version` | Definition: Web part data version. Note that data version is different from the version field in the manifest. The manifest version is used to control the versioning of the web part code, while data version is used to control the versioning of the serialized data of the web part. Refer to dataVersion field of your web part for more information. Usage: versioning and evolving the serialized data of the web part Required: yes Type: Version Supported values: MAJOR.MINOR Example: "1.0" |
|  [`properties`](./sp-webpart-base.iserializedwebpartdata.properties.md) | `any` | Definition: Web part specific properties. The individual web part owns the definition of these properties. Usage: used by the web part to manage its internal metadata and config data. The framework code never touches these properties. Required: yes Type: any Supported values: any JSON stringifiable object hierarchy. Example: { 'value': 'text value' } |
|  [`serverProcessedContent`](./sp-webpart-base.iserializedwebpartdata.serverprocessedcontent.md) | `ISerializedServerProcessedData` | Definition: The collections of data that can be processed by server side services like search index and link fixup Required: no |

