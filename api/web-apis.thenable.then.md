[Home](./index) &gt; [web-apis](web-apis.md) &gt; [Thenable](web-apis.thenable.md) &gt; [then](web-apis.thenable.then.md)

# Thenable.then method


**Signature:**
```javascript
then < U >(onFulfilled?: (value: T) => U | Thenable<U>, onRejected?: (error: any) => U | Thenable<U>): Thenable<U>;
```
**Returns:** `Thenable<U>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `onFulfilled` | `(value: T) => U | Thenable<U>` |  |
|  `onRejected` | `(error: any) => U | Thenable<U>` |  |

