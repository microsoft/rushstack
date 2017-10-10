[Home](./index) &gt; [local](local.md) &gt; [OfficeExtension\_TrackedObjects](local.officeextension_trackedobjects.md)

# OfficeExtension\_TrackedObjects class

Collection of tracked objects, contained within a request context. See "context.trackedObjects" for more information.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(object)`](local.officeextension_trackedobjects.add.md) |  | `void` | Track a new object for automatic adjustment based on surrounding changes in the document. Only some object types require this. If you are using an object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`remove(object)`](local.officeextension_trackedobjects.remove.md) |  | `void` | Release the memory associated with an object that was previously added to this collection. Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

