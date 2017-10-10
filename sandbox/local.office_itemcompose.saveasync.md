[Home](./index) &gt; [local](local.md) &gt; [Office\_ItemCompose](local.office_itemcompose.md) &gt; [saveAsync](local.office_itemcompose.saveasync.md)

# Office\_ItemCompose.saveAsync method

Asynchronously saves an item. 

 When invoked, this method saves the current message as a draft and returns the item id via the callback method. In Outlook Web App or Outlook in online mode, the item is saved to the server. In Outlook in cached mode, the item is saved to the local cache.

**Signature:**
```javascript
saveAsync(options?: AsyncContextOptions, callback?: (result: AsyncResult) => void): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `options` | `AsyncContextOptions` |  |
|  `callback` | `(result: AsyncResult) => void` |  |

