[Home](./index) &gt; [local](local.md) &gt; [Word\_CustomProperty](local.word_customproperty.md)

# Word\_CustomProperty class

Represents a custom property. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`key`](local.word_customproperty.key.md) |  | `string` | Gets the key of the custom property. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`type`](local.word_customproperty.type.md) |  | `string` | Gets the value type of the custom property. Possible values are: String, Number, Date, Boolean. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`value`](local.word_customproperty.value.md) |  | `any` | Gets or sets the value of the custom property. Note that even though Word Online and the docx file format allow these properties to be arbitrarily long, the desktop version of Word will truncate string values to 255 16-bit chars (possibly creating invalid unicode by breaking up a surrogate pair). <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.word_customproperty.delete.md) |  | `void` | Deletes the custom property. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_customproperty.load.md) |  | `Word.CustomProperty` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_customproperty.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_customproperty.tojson.md) |  | `{
            "key": string;
            "type": string;
            "value": any;
        }` |  |
|  [`track()`](local.word_customproperty.track.md) |  | `Word.CustomProperty` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_customproperty.untrack.md) |  | `Word.CustomProperty` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

