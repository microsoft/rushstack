[Home](./index) &gt; [local](local.md) &gt; [OneNote\_run](local.onenote_run.md)

# OneNote\_run function

Executes a batch script that performs actions on the OneNote object model. When the promise is resolved, any tracked objects that were automatically allocated during execution will be released.

**Signature:**
```javascript
OneNote_run
```
**Returns:** `OfficeExtension.IPromise<T>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `batch` | `(context: OneNote.RequestContext) => OfficeExtension.IPromise<T>` | A function that takes in a RequestContext and returns a promise (typically, just the result of "context.sync()"). The context parameter facilitates requests to the OneNote application. Since the Office add-in and the WoOneNote application run in two different processes, the request context is required to get access to the OneNote object model from the add-in. |

