[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_ClientObject](local.officeextension_clientobject.md)

# OfficeExtension\_ClientObject class

An abstract proxy object that represents an object in an Office document. You create proxy objects from the context (or from other proxy objects), add commands to a queue to act on the object, and then synchronize the proxy object state with the document by calling "context.sync()".

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`context`](local.officeextension_clientobject.context.md) |  | `ClientRequestContext` | The request context associated with the object |
|  [`isNullObject`](local.officeextension_clientobject.isnullobject.md) |  | `boolean` | Returns a boolean value for whether the corresponding object is a null object. You must call "context.sync()" before reading the isNullObject property. |

