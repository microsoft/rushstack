[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_TrackedObjects](local.officeextension_trackedobjects.md) &gt; [remove](local.officeextension_trackedobjects.remove.md)

# OfficeExtension\_TrackedObjects.remove method

Release the memory associated with an object that was previously added to this collection. Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect.

**Signature:**
```javascript
remove(object: ClientObject): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `object` | `ClientObject` |  |

