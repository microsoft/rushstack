[Home](./index) &gt; [local](local.md) &gt; [Office\_ItemCompose](local.office_itemcompose.md) &gt; [getSelectedDataAsync](local.office_itemcompose.getselecteddataasync.md)

# Office\_ItemCompose.getSelectedDataAsync method

Asynchronously returns selected data from the subject or body of a message. 

 If there is no selection but the cursor is in the body or the subject, the method returns null for the selected data. If a field other than the body or subject is selected, the method returns the InvalidSelection error

**Signature:**
```javascript
getSelectedDataAsync(coercionType: CoercionType, options?: AsyncContextOptions, callback?: (result: AsyncResult) => void): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `coercionType` | `CoercionType` |  |
|  `options` | `AsyncContextOptions` |  |
|  `callback` | `(result: AsyncResult) => void` |  |

