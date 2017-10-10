[Home](./index) &gt; [local](local.md) &gt; [Word\_TableRowCollection](local.word_tablerowcollection.md)

# Word\_TableRowCollection class

Contains the collection of the document's TableRow objects. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_tablerowcollection.items.md) |  | `Array<Word.TableRow>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getFirst()`](local.word_tablerowcollection.getfirst.md) |  | `Word.TableRow` | Gets the first row in this collection. Throws if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_tablerowcollection.getfirstornullobject.md) |  | `Word.TableRow` | Gets the first row in this collection. Returns a null object if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_tablerowcollection.load.md) |  | `Word.TableRowCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_tablerowcollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_tablerowcollection.track.md) |  | `Word.TableRowCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_tablerowcollection.untrack.md) |  | `Word.TableRowCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

