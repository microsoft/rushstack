[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_ClientRequestContext](local.officeextension_clientrequestcontext.md) &gt; [load](local.officeextension_clientrequestcontext.load.md)

# OfficeExtension\_ClientRequestContext.load method

Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties.

**Signature:**
```javascript
load(object: ClientObject, option?: string | string[]| LoadOption): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `object` | `ClientObject` |  |
|  `option` | `string | string[]| LoadOption` |  |

