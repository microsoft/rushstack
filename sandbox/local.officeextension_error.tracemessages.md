[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_Error](local.officeextension_error.md) &gt; [traceMessages](local.officeextension_error.tracemessages.md)

# OfficeExtension\_Error.traceMessages property

Trace messages (if any) that were added via a "context.trace()" invocation before calling "context.sync()". If there was an error, this contains all trace messages that were executed before the error occurred. These messages can help you monitor the program execution sequence and detect the case of the error.

**Signature:**
```javascript
traceMessages: Array<string>
```
