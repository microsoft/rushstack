[Home](./index) &gt; [local](local.md) &gt; [Word\_CustomPropertyCollection](local.word_custompropertycollection.md)

# Word\_CustomPropertyCollection class

Contains the collection of \[customProperty\](customProperty.md) objects. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.word_custompropertycollection.items.md) |  | `Array<Word.CustomProperty>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(key, value)`](local.word_custompropertycollection.add.md) |  | `Word.CustomProperty` | Creates a new or sets an existing custom property. <p/> \[Api set: WordApi 1.3\] |
|  [`deleteAll()`](local.word_custompropertycollection.deleteall.md) |  | `void` | Deletes all custom properties in this collection. <p/> \[Api set: WordApi 1.3\] |
|  [`getCount()`](local.word_custompropertycollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the count of custom properties. <p/> \[Api set: WordApi 1.3\] |
|  [`getItem(key)`](local.word_custompropertycollection.getitem.md) |  | `Word.CustomProperty` | Gets a custom property object by its key, which is case-insensitive. Throws if the custom property does not exist. <p/> \[Api set: WordApi 1.3\] |
|  [`getItemOrNullObject(key)`](local.word_custompropertycollection.getitemornullobject.md) |  | `Word.CustomProperty` | Gets a custom property object by its key, which is case-insensitive. Returns a null object if the custom property does not exist. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_custompropertycollection.load.md) |  | `Word.CustomPropertyCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.word_custompropertycollection.tojson.md) |  | `{}` |  |
|  [`track()`](local.word_custompropertycollection.track.md) |  | `Word.CustomPropertyCollection` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_custompropertycollection.untrack.md) |  | `Word.CustomPropertyCollection` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

