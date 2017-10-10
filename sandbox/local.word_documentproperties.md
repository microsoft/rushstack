[Home](./index) &gt; [local](local.md) &gt; [Word\_DocumentProperties](local.word_documentproperties.md)

# Word\_DocumentProperties class

Represents document properties. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`applicationName`](local.word_documentproperties.applicationname.md) |  | `string` | Gets the application name of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`author`](local.word_documentproperties.author.md) |  | `string` | Gets or sets the author of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`category`](local.word_documentproperties.category.md) |  | `string` | Gets or sets the category of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`comments`](local.word_documentproperties.comments.md) |  | `string` | Gets or sets the comments of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`company`](local.word_documentproperties.company.md) |  | `string` | Gets or sets the company of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`creationDate`](local.word_documentproperties.creationdate.md) |  | `Date` | Gets the creation date of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`customProperties`](local.word_documentproperties.customproperties.md) |  | `Word.CustomPropertyCollection` | Gets the collection of custom properties of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`format`](local.word_documentproperties.format.md) |  | `string` | Gets or sets the format of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`keywords`](local.word_documentproperties.keywords.md) |  | `string` | Gets or sets the keywords of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`lastAuthor`](local.word_documentproperties.lastauthor.md) |  | `string` | Gets the last author of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`lastPrintDate`](local.word_documentproperties.lastprintdate.md) |  | `Date` | Gets the last print date of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`lastSaveTime`](local.word_documentproperties.lastsavetime.md) |  | `Date` | Gets the last save time of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`manager`](local.word_documentproperties.manager.md) |  | `string` | Gets or sets the manager of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`revisionNumber`](local.word_documentproperties.revisionnumber.md) |  | `string` | Gets the revision number of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`security`](local.word_documentproperties.security.md) |  | `number` | Gets the security of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`subject`](local.word_documentproperties.subject.md) |  | `string` | Gets or sets the subject of the document. <p/> \[Api set: WordApi 1.3\] |
|  [`template`](local.word_documentproperties.template.md) |  | `string` | Gets the template of the document. Read only. <p/> \[Api set: WordApi 1.3\] |
|  [`title`](local.word_documentproperties.title.md) |  | `string` | Gets or sets the title of the document. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.word_documentproperties.load.md) |  | `Word.DocumentProperties` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_documentproperties.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_documentproperties.tojson.md) |  | `{
            "applicationName": string;
            "author": string;
            "category": string;
            "comments": string;
            "company": string;
            "creationDate": Date;
            "format": string;
            "keywords": string;
            "lastAuthor": string;
            "lastPrintDate": Date;
            "lastSaveTime": Date;
            "manager": string;
            "revisionNumber": string;
            "security": number;
            "subject": string;
            "template": string;
            "title": string;
        }` |  |
|  [`track()`](local.word_documentproperties.track.md) |  | `Word.DocumentProperties` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_documentproperties.untrack.md) |  | `Word.DocumentProperties` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

