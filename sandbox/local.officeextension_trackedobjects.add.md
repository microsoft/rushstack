[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_TrackedObjects](local.officeextension_trackedobjects.md) &gt; [add](local.officeextension_trackedobjects.add.md)

# OfficeExtension\_TrackedObjects.add method

Track a new object for automatic adjustment based on surrounding changes in the document. Only some object types require this. If you are using an object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created.

**Signature:**
```javascript
add(object: ClientObject): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `object` | `ClientObject` |  |

