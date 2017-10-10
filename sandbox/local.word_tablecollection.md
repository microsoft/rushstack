[Home](./index) &gt; [local](local.md) &gt; [Word\_TableCollection](local.word_tablecollection.md)

# Word\_TableCollection class

Contains the collection of the document's Table objects. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_tablecollection.items.md) |  | `Array<Word.Table>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getFirst()`](local.word_tablecollection.getfirst.md) |  | `Word.Table` | Gets the first table in this collection. Throws if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_tablecollection.getfirstornullobject.md) |  | `Word.Table` | Gets the first table in this collection. Returns a null object if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_tablecollection.load.md) |  | `Word.TableCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_tablecollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_tablecollection.track.md) |  | `Word.TableCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_tablecollection.untrack.md) |  | `Word.TableCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

