[Home](./index) &gt; [web-apis](./web-apis.md) &gt; [Promise](./web-apis.promise.md) &gt; [then](./web-apis.promise.then.md)

# Promise.then method


**Signature:**
```javascript
then<U>(onFulfilled?: (value: T) => U | Thenable<U>, onRejected?: (error: any) => U | Thenable<U>): Promise<U>;
```
**Returns:** `Promise<U>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `onFulfilled` | `(value: T) => U | Thenable<U>` |  |
|  `onRejected` | `(error: any) => U | Thenable<U>` |  |

