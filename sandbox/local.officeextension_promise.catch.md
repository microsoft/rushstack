[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_Promise](local.officeextension_promise.md) &gt; [catch](local.officeextension_promise.catch.md)

# OfficeExtension\_Promise.catch method

Catches failures or exceptions from actions within the promise, or from an unhandled exception earlier in the call stack.

**Signature:**
```javascript
catch < U >(onRejected?: (error: any) => IPromise<U>): IPromise<U>;
```
**Returns:** `IPromise<U>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `onRejected` | `(error: any) => IPromise<U>` |  |

