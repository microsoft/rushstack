[Home](./index) &gt; [local](local.md) &gt; [Word\_Section](local.word_section.md)

# Word\_Section class

Represents a section in a Word document. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`body`](local.word_section.body.md) |  | `Word.Body` | Gets the body object of the section. This does not include the header/footer and other section metadata. Read-only. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getFooter(type)`](local.word_section.getfooter.md) |  | `Word.Body` | Gets one of the section's footers. <p/> \[Api set: WordApi 1.1\] |
|  [`getHeader(type)`](local.word_section.getheader.md) |  | `Word.Body` | Gets one of the section's headers. <p/> \[Api set: WordApi 1.1\] |
|  [`getNext()`](local.word_section.getnext.md) |  | `Word.Section` | Gets the next section. Throws if this section is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextOrNullObject()`](local.word_section.getnextornullobject.md) |  | `Word.Section` | Gets the next section. Returns a null object if this section is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_section.load.md) |  | `Word.Section` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_section.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_section.tojson.md) |  | `{
            "body": Body;
        }` |  |
|  [`track()`](local.word_section.track.md) |  | `Word.Section` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_section.untrack.md) |  | `Word.Section` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

