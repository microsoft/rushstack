[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_Promise](local.officeextension_promise.md) &gt; [constructor](local.officeextension_promise.constructor.md)

# OfficeExtension\_Promise.constructor method

Creates a new promise based on a function that accepts resolve and reject handlers.

**Signature:**
```javascript
constructor(func: (resolve: (value?: R | IPromise<R>) => void, reject: (error?: any) => void) => void);
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `func` | `(resolve: (value?: R | IPromise<R>) => void, reject: (error?: any) => void) => void` |  |

