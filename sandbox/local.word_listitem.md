[Home](./index) &gt; [local](local.md) &gt; [Word\_ListItem](local.word_listitem.md)

# Word\_ListItem class

Represents the paragraph list item format. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`level`](local.word_listitem.level.md) |  | `number` | Gets or sets the level of the item in the list. <p/> \[Api set: WordApi 1.3\] |
|  [`listString`](local.word_listitem.liststring.md) |  | `string` | Gets the list item bullet, number or picture as a string. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`siblingIndex`](local.word_listitem.siblingindex.md) |  | `number` | Gets the list item order number in relation to its siblings. Read-only. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getAncestor(parentOnly)`](local.word_listitem.getancestor.md) |  | `Word.Paragraph` | Gets the list item parent, or the closest ancestor if the parent does not exist. Throws if the list item has no ancester. <p/> \[Api set: WordApi 1.3\] |
|  [`getAncestorOrNullObject(parentOnly)`](local.word_listitem.getancestorornullobject.md) |  | `Word.Paragraph` | Gets the list item parent, or the closest ancestor if the parent does not exist. Returns a null object if the list item has no ancester. <p/> \[Api set: WordApi 1.3\] |
|  [`getDescendants(directChildrenOnly)`](local.word_listitem.getdescendants.md) |  | `Word.ParagraphCollection` | Gets all descendant list items of the list item. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_listitem.load.md) |  | `Word.ListItem` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_listitem.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_listitem.tojson.md) |  | `{
            "level": number;
            "listString": string;
            "siblingIndex": number;
        }` |  |
|  [`track()`](local.word_listitem.track.md) |  | `Word.ListItem` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_listitem.untrack.md) |  | `Word.ListItem` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

