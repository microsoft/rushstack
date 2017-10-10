[Home](./index) &gt; [local](local.md) &gt; [Word\_Document](local.word_document.md)

# Word\_Document class

The Document object is the top level object. A Document object contains one or more sections, content controls, and the body that contains the contents of the document. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`body`](local.word_document.body.md) |  | `Word.Body` | Gets the body object of the document. The body is the text that excludes headers, footers, footnotes, textboxes, etc.. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`contentControls`](local.word_document.contentcontrols.md) |  | `Word.ContentControlCollection` | Gets the collection of content control objects in the current document. This includes content controls in the body of the document, headers, footers, textboxes, etc.. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`properties`](local.word_document.properties.md) |  | `Word.DocumentProperties` | Gets the properties of the current document. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`saved`](local.word_document.saved.md) |  | `boolean` | Indicates whether the changes in the document have been saved. A value of true indicates that the document hasn't changed since it was saved. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`sections`](local.word_document.sections.md) |  | `Word.SectionCollection` | Gets the collection of section objects in the document. Read-only. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getSelection()`](local.word_document.getselection.md) |  | `Word.Range` | Gets the current selection of the document. Multiple selections are not supported. <p/> \[Api set: WordApi 1.1\] |
|  [`load(option)`](local.word_document.load.md) |  | `Word.Document` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`save()`](local.word_document.save.md) |  | `void` | Saves the document. This will use the Word default file naming convention if the document has not been saved before. <p/> \[Api set: WordApi 1.1\] |
|  [`set(properties, options)`](local.word_document.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_document.tojson.md) |  | `{
            "body": Body;
            "properties": DocumentProperties;
            "saved": boolean;
        }` |  |
|  [`track()`](local.word_document.track.md) |  | `Word.Document` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_document.untrack.md) |  | `Word.Document` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

