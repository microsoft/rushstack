[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_ClientRequestContext](local.officeextension_clientrequestcontext.md) &gt; [loadRecursive](local.officeextension_clientrequestcontext.loadrecursive.md)

# OfficeExtension\_ClientRequestContext.loadRecursive method

Queues up a command to recursively load the specified properties of the object and its navigation properties. You must call "context.sync()" before reading the properties.

**Signature:**
```javascript
loadRecursive(object: ClientObject, options: { [typeName: string]: string | string[] | LoadOption }, maxDepth?: number): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `object` | `ClientObject` |  |
|  `options` | `{ [typeName: string]: string | string[] | LoadOption }` |  |
|  `maxDepth` | `number` |  |

