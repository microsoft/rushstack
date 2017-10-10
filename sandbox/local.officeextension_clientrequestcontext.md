[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_ClientRequestContext](local.officeextension_clientrequestcontext.md)

# OfficeExtension\_ClientRequestContext class

An abstract RequestContext object that facilitates requests to the host Office application. The "Excel.run" and "Word.run" methods provide a request context.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`requestHeaders`](local.officeextension_clientrequestcontext.requestheaders.md) |  | `{ [name: string]: string }` | Request headers |
|  [`trackedObjects`](local.officeextension_clientrequestcontext.trackedobjects.md) |  | `TrackedObjects` | Collection of objects that are tracked for automatic adjustments based on surrounding changes in the document. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(url)`](local.officeextension_clientrequestcontext.constructor.md) |  |  | Constructs a new instance of the [OfficeExtension\_ClientRequestContext](local.officeextension_clientrequestcontext.md) class |
|  [`load(object, option)`](local.officeextension_clientrequestcontext.load.md) |  | `void` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`loadRecursive(object, options, maxDepth)`](local.officeextension_clientrequestcontext.loadrecursive.md) |  | `void` | Queues up a command to recursively load the specified properties of the object and its navigation properties. You must call "context.sync()" before reading the properties. |
|  [`sync(passThroughValue)`](local.officeextension_clientrequestcontext.sync.md) |  | `IPromise<T>` | Synchronizes the state between JavaScript proxy objects and the Office document, by executing instructions queued on the request context and retrieving properties of loaded Office objects for use in your code.�This method returns a promise, which is resolved when the synchronization is complete. |
|  [`trace(message)`](local.officeextension_clientrequestcontext.trace.md) |  | `void` | Adds a trace message to the queue. If the promise returned by "context.sync()" is rejected due to an error, this adds a ".traceMessages" array to the OfficeExtension.Error object, containing all trace messages that were executed. These messages can help you monitor the program execution sequence and detect the cause of the error. |

