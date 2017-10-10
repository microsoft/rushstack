[Home](./index) &gt; [local](local.md) &gt; [Excel\_run](local.excel_run.md)

# Excel\_run function

Executes a batch script that performs actions on the Excel object model, using the remote RequestContext of previously-created API objects.

**Signature:**
```javascript
Excel_run
```
**Returns:** `OfficeExtension.IPromise<T>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `requestInfo` | `OfficeExtension.RequestUrlAndHeaderInfo | Session` | The URL of the remote workbook and the request headers to be sent. |
|  `objects` | `OfficeExtension.ClientObject[]` | An array of previously-created API objects. The array will be validated to make sure that all of the objects share the same context. The batch will use this shared RequestContext, which means that any changes applied to these objects will be picked up by "context.sync()". |
|  `batch` | `(context: Excel.RequestContext) => OfficeExtension.IPromise<T>` | A function that takes in a RequestContext and returns a promise (typically, just the result of "context.sync()"). The context parameter facilitates requests to the Excel application. Since the Office add-in and the Excel application run in two different processes, the RequestContext is required to get access to the Excel object model from the add-in. |

