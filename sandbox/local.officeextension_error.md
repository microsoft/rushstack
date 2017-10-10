[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_Error](local.officeextension_error.md)

# OfficeExtension\_Error class

The error object returned by "context.sync()", if a promise is rejected due to an error while processing the request.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`code`](local.officeextension_error.code.md) |  | `string` | Error code string, such as "InvalidArgument". |
|  [`debugInfo`](local.officeextension_error.debuginfo.md) |  | `DebugInfo` | Debug info (useful for detailed logging of the error, i.e., via JSON.stringify(...)). |
|  [`innerError`](local.officeextension_error.innererror.md) |  | `Error` | Inner error, if applicable. |
|  [`message`](local.officeextension_error.message.md) |  | `string` | The error message passed through from the host Office application. |
|  [`name`](local.officeextension_error.name.md) |  | `string` | Error name: "OfficeExtension.Error". |
|  [`stack`](local.officeextension_error.stack.md) |  | `string` | Stack trace, if applicable. |
|  [`traceMessages`](local.officeextension_error.tracemessages.md) |  | `Array<string>` | Trace messages (if any) that were added via a "context.trace()" invocation before calling "context.sync()". If there was an error, this contains all trace messages that were executed before the error occurred. These messages can help you monitor the program execution sequence and detect the case of the error. |

