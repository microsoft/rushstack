[Home](./index) &gt; [local](local.md) &gt; [Word\_InlinePictureCollection](local.word_inlinepicturecollection.md)

# Word\_InlinePictureCollection class

Contains a collection of \[inlinePicture\](inlinePicture.md) objects. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_inlinepicturecollection.items.md) |  | `Array<Word.InlinePicture>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getFirst()`](local.word_inlinepicturecollection.getfirst.md) |  | `Word.InlinePicture` | Gets the first inline image in this collection. Throws if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_inlinepicturecollection.getfirstornullobject.md) |  | `Word.InlinePicture` | Gets the first inline image in this collection. Returns a null object if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_inlinepicturecollection.load.md) |  | `Word.InlinePictureCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_inlinepicturecollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_inlinepicturecollection.track.md) |  | `Word.InlinePictureCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_inlinepicturecollection.untrack.md) |  | `Word.InlinePictureCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

