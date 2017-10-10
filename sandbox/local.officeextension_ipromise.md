[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_IPromise](local.officeextension_ipromise.md)

# OfficeExtension\_IPromise interface

An IPromise object that represents a deferred interaction with the host Office application.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`catch(onRejected)`](local.officeextension_ipromise.catch.md) | `IPromise<U>` | Catches failures or exceptions from actions within the promise, or from an unhandled exception earlier in the call stack. |
|  [`then(onFulfilled, onRejected)`](local.officeextension_ipromise.then.md) | `IPromise<U>` | This method will be called once the previous promise has been resolved. Both the onFulfilled on onRejected callbacks are optional. If either or both are omitted, the next onFulfilled/onRejected in the chain will be called called. |

