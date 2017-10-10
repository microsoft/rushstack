[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_ClientRequestContext](local.officeextension_clientrequestcontext.md) &gt; [trace](local.officeextension_clientrequestcontext.trace.md)

# OfficeExtension\_ClientRequestContext.trace method

Adds a trace message to the queue. If the promise returned by "context.sync()" is rejected due to an error, this adds a ".traceMessages" array to the OfficeExtension.Error object, containing all trace messages that were executed. These messages can help you monitor the program execution sequence and detect the cause of the error.

**Signature:**
```javascript
trace(message: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `message` | `string` |  |

