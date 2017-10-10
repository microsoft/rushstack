[Home](./index) &gt; [local](local.md) &gt; [Word\_run](local.word_run.md)

# Word\_run function

Executes a batch script that performs actions on the Word object model, using the RequestContext of previously-created API objects.

**Signature:**
```javascript
Word_run
```
**Returns:** `OfficeExtension.IPromise<T>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `objects` | `OfficeExtension.ClientObject[]` | An array of previously-created API objects. The array will be validated to make sure that all of the objects share the same context. The batch will use this shared RequestContext, which means that any changes applied to these objects will be picked up by "context.sync()". |
|  `batch` | `(context: Word.RequestContext) => OfficeExtension.IPromise<T>` | A function that takes in a RequestContext and returns a promise (typically, just the result of "context.sync()"). The context parameter facilitates requests to the Word application. Since the Office add-in and the Word application run in two different processes, the RequestContext is required to get access to the Word object model from the add-in. |

