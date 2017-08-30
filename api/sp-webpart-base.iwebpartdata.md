<!-- docId=sp-webpart-base.iwebpartdata -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IWebPartData interface

This structure represents the serialized state of a web part. When the serialize() API is called on a web part, the output should be this structure. The structure of the 'properties' field is owned by the web part and is specific to the web part. Each web part can decide the set of properties it wants to serialialize.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`dataVersion`](./sp-webpart-base.iwebpartdata.dataversion.md) | `string` | Definition: Web part data version. Note that data version is different from the version field in the manifest. The manifest version is used to control the versioning of the web part code, while data version is used to control the versioning of the serialized data of the web part. Refer to dataVersion field of your web part for more information. Usage: versioning and evolving the serialized data of the web part Required: yes Type: string Supported values: MAJOR.MINOR Example: "1.0" |
|  [`description`](./sp-webpart-base.iwebpartdata.description.md) | `string` | Definition: web part description. Usage: display the description of the web part. Required: no Type: string Supported values: string with the description. Example: "Text" |
|  [`id`](./sp-webpart-base.iwebpartdata.id.md) | `string` | Definition: universally unique web part Type id. Usage: uniquely identify a web part. Required: yes Type: GUID Supported values: any GUID Example: "dbef608d-3ad5-4f8f-b139-d916f2f0a294" |
|  [`instanceId`](./sp-webpart-base.iwebpartdata.instanceid.md) | `string` | Definition: universally unique instance id of the web part. A web part can have multiple instances on a page. This id is expected to be universally unique accross time and page boundaries. how used: used by the framework to uniquely identify an instance of a web part. mandatory: yes type: string supported values: a unique string. Could be GUID or other uniquely identifiable formats. example: \["dbef608d-3ad5-4f8f-b139-d916f2f0a294"\] experimental: yes |
|  [`properties`](./sp-webpart-base.iwebpartdata.properties.md) | `any` | Definition: Web part specific properties. The individual web part owns the definition of these properties. Usage: used by the web part to manage its internal metadata and config data. The framework code never touches these properties. Required: yes Type: any Supported values: any JSON stringifiable object hierarchy. Example: { 'value': 'text value' } |
|  [`serverProcessedContent`](./sp-webpart-base.iwebpartdata.serverprocessedcontent.md) | `ISerializedServerProcessedData` | Definition: The collections of data that can be processed by server side services like search index and link fixup Required: no |
|  [`title`](./sp-webpart-base.iwebpartdata.title.md) | `string` | Definition: web part title. Usage: display the name of the web part in the toolbox, web part gallery and the page. Required: yes Type: string Supported values: string less than 100 characters Example: "Text" |

