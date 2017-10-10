[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_IPromise](local.officeextension_ipromise.md) &gt; [then](local.officeextension_ipromise.then.md)

# OfficeExtension\_IPromise.then method

This method will be called once the previous promise has been resolved. Both the onFulfilled on onRejected callbacks are optional. If either or both are omitted, the next onFulfilled/onRejected in the chain will be called called.

**Signature:**
```javascript
then < U >(onFulfilled?: (value: R) => IPromise<U>, onRejected?: (error: any) => IPromise<U>): IPromise<U>;
```
**Returns:** `IPromise<U>`

A new promise for the value or error that was returned from onFulfilled/onRejected.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `onFulfilled` | `(value: R) => IPromise<U>` |  |
|  `onRejected` | `(error: any) => IPromise<U>` |  |

