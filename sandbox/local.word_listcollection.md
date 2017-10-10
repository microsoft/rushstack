[Home](./index) &gt; [local](local.md) &gt; [Word\_ListCollection](local.word_listcollection.md)

# Word\_ListCollection class

Contains a collection of \[list\](list.md) objects. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_listcollection.items.md) |  | `Array<Word.List>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getById(id)`](local.word_listcollection.getbyid.md) |  | `Word.List` | Gets a list by its identifier. Throws if there isn't a list with the identifier in this collection. <p/> \[Api set: WordApi 1.3\] |
|  [`getByIdOrNullObject(id)`](local.word_listcollection.getbyidornullobject.md) |  | `Word.List` | Gets a list by its identifier. Returns a null object if there isn't a list with the identifier in this collection. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirst()`](local.word_listcollection.getfirst.md) |  | `Word.List` | Gets the first list in this collection. Throws if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_listcollection.getfirstornullobject.md) |  | `Word.List` | Gets the first list in this collection. Returns a null object if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getItem(index)`](local.word_listcollection.getitem.md) |  | `Word.List` | Gets a list object by its index in the collection. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_listcollection.load.md) |  | `Word.ListCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_listcollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_listcollection.track.md) |  | `Word.ListCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_listcollection.untrack.md) |  | `Word.ListCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

