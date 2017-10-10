[Home](./index) &gt; [local](local.md) &gt; [Word\_ContentControlCollection](local.word_contentcontrolcollection.md)

# Word\_ContentControlCollection class

Contains a collection of \[contentControl\](contentControl.md) objects. Content controls are bounded and potentially labeled regions in a document that serve as containers for specific types of content. Individual content controls may contain contents such as images, tables, or paragraphs of formatted text. Currently, only rich text content controls are supported. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_contentcontrolcollection.items.md) |  | `Array<Word.ContentControl>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getById(id)`](local.word_contentcontrolcollection.getbyid.md) |  | `Word.ContentControl` | Gets a content control by its identifier. Throws if there isn't a content control with the identifier in this collection. <p/> \[Api set: WordApi 1.1\] |
|  [`getByIdOrNullObject(id)`](local.word_contentcontrolcollection.getbyidornullobject.md) |  | `Word.ContentControl` | Gets a content control by its identifier. Returns a null object if there isn't a content control with the identifier in this collection. <p/> \[Api set: WordApi 1.3\] |
|  [`getByTag(tag)`](local.word_contentcontrolcollection.getbytag.md) |  | `Word.ContentControlCollection` | Gets the content controls that have the specified tag. <p/> \[Api set: WordApi 1.1\] |
|  [`getByTitle(title)`](local.word_contentcontrolcollection.getbytitle.md) |  | `Word.ContentControlCollection` | Gets the content controls that have the specified title. <p/> \[Api set: WordApi 1.1\] |
|  [`getByTypes(types)`](local.word_contentcontrolcollection.getbytypes.md) |  | `Word.ContentControlCollection` | Gets the content controls that have the specified types and/or subtypes. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirst()`](local.word_contentcontrolcollection.getfirst.md) |  | `Word.ContentControl` | Gets the first content control in this collection. Throws if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_contentcontrolcollection.getfirstornullobject.md) |  | `Word.ContentControl` | Gets the first content control in this collection. Returns a null object if this collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getItem(index)`](local.word_contentcontrolcollection.getitem.md) |  | `Word.ContentControl` | Gets a content control by its index in the collection. <p/> \[Api set: WordApi 1.1\] |
|  [`load(option)`](local.word_contentcontrolcollection.load.md) |  | `Word.ContentControlCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_contentcontrolcollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_contentcontrolcollection.track.md) |  | `Word.ContentControlCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_contentcontrolcollection.untrack.md) |  | `Word.ContentControlCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

