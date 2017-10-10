[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_Promise](local.officeextension_promise.md)

# OfficeExtension\_Promise class

An Promise object that represents a deferred interaction with the host Office application. The publically-consumable OfficeExtension.Promise is available starting in ExcelApi 1.2 and WordApi 1.2. Promises can be chained via ".then", and errors can be caught via ".catch". Remember to always use a ".catch" on the outer promise, and to return intermediary promises so as not to break the promise chain. When a "native" Promise implementation is available, OfficeExtension.Promise will switch to use the native Promise instead.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(func)`](local.officeextension_promise.constructor.md) |  |  | Creates a new promise based on a function that accepts resolve and reject handlers. |
|  [`all(promises)`](local.officeextension_promise.all.md) |  | `IPromise<U[]>` | Creates a promise that resolves when all of the child promises resolve. |
|  [`catch(onRejected)`](local.officeextension_promise.catch.md) |  | `IPromise<U>` | Catches failures or exceptions from actions within the promise, or from an unhandled exception earlier in the call stack. |
|  [`reject(error)`](local.officeextension_promise.reject.md) |  | `IPromise<U>` | Creates a promise that is rejected. |
|  [`resolve(value)`](local.officeextension_promise.resolve.md) |  | `IPromise<U>` | Creates a promise that is resolved. |
|  [`then(onFulfilled, onRejected)`](local.officeextension_promise.then.md) |  | `IPromise<U>` |  |

