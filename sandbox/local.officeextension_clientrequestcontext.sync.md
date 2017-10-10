[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_ClientRequestContext](local.officeextension_clientrequestcontext.md) &gt; [sync](local.officeextension_clientrequestcontext.sync.md)

# OfficeExtension\_ClientRequestContext.sync method

Synchronizes the state between JavaScript proxy objects and the Office document, by executing instructions queued on the request context and retrieving properties of loaded Office objects for use in your code.�This method returns a promise, which is resolved when the synchronization is complete.

**Signature:**
```javascript
sync < T >(passThroughValue?: T): IPromise<T>;
```
**Returns:** `IPromise<T>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `passThroughValue` | `T` |  |

