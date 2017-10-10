[Home](./index) &gt; [local](local.md) &gt; [Word\_ParagraphCollection](local.word_paragraphcollection.md)

# Word\_ParagraphCollection class

Contains a collection of \[paragraph\](paragraph.md) objects. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_paragraphcollection.items.md) |  | `Array<Word.Paragraph>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getFirst()`](local.word_paragraphcollection.getfirst.md) |  | `Word.Paragraph` | Gets the first paragraph in this collection. Throws if the collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getFirstOrNullObject()`](local.word_paragraphcollection.getfirstornullobject.md) |  | `Word.Paragraph` | Gets the first paragraph in this collection. Returns a null object if the collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getLast()`](local.word_paragraphcollection.getlast.md) |  | `Word.Paragraph` | Gets the last paragraph in this collection. Throws if the collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`getLastOrNullObject()`](local.word_paragraphcollection.getlastornullobject.md) |  | `Word.Paragraph` | Gets the last paragraph in this collection. Returns a null object if the collection is empty. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_paragraphcollection.load.md) |  | `Word.ParagraphCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_paragraphcollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_paragraphcollection.track.md) |  | `Word.ParagraphCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_paragraphcollection.untrack.md) |  | `Word.ParagraphCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

