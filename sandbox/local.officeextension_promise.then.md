[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_Promise](local.officeextension_promise.md) &gt; [then](local.officeextension_promise.then.md)

# OfficeExtension\_Promise.then method


**Signature:**
```javascript
then < U >(onFulfilled?: (value: R) => IPromise<U>, onRejected?: (error: any) => IPromise<U>): IPromise<U>;
```
**Returns:** `IPromise<U>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `onFulfilled` | `(value: R) => IPromise<U>` |  |
|  `onRejected` | `(error: any) => IPromise<U>` |  |

