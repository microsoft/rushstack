[Home](./index) &gt; [local](local.md) &gt; [Word\_TableBorder](local.word_tableborder.md)

# Word\_TableBorder class

Specifies the border style 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`color`](local.word_tableborder.color.md) |  | `string` | Gets or sets the table border color, as a hex value or name. <p/> \[Api set: WordApi 1.3\] |
|  [`type`](local.word_tableborder.type.md) |  | `string` | Gets or sets the type of the table border. <p/> \[Api set: WordApi 1.3\] |
|  [`width`](local.word_tableborder.width.md) |  | `number` | Gets or sets the width, in points, of the table border. Not applicable to table border types that have fixed widths. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.word_tableborder.load.md) |  | `Word.TableBorder` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_tableborder.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_tableborder.tojson.md) |  | `{
            "color": string;
            "type": string;
            "width": number;
        }` |  |
|  [`track()`](local.word_tableborder.track.md) |  | `Word.TableBorder` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_tableborder.untrack.md) |  | `Word.TableBorder` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

