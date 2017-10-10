[Home](./index) &gt; [local](local.md) &gt; [Word\_TableCellCollection](local.word_tablecellcollection.md)

# Word\_TableCellCollection class

Contains the collection of the document's TableCell objects. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_tablecellcollection.items.md) |  | `Array<Word.TableCell>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getFirst()`](local.word_tablecellcollection.getfirst.md) |  | `Word.TableCell` | Gets the first table cell in this collection. Throws if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_tablecellcollection.getfirstornullobject.md) |  | `Word.TableCell` | Gets the first table cell in this collection. Returns a null object if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_tablecellcollection.load.md) |  | `Word.TableCellCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_tablecellcollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_tablecellcollection.track.md) |  | `Word.TableCellCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_tablecellcollection.untrack.md) |  | `Word.TableCellCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

