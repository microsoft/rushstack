[Home](./index) &gt; [local](local.md) &gt; [Word\_Body](local.word_body.md)

# Word\_Body class

Represents the body of a document or a section. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`contentControls`](local.word_body.contentcontrols.md) |  | `Word.ContentControlCollection` | Gets the collection of rich text content control objects in the body. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`font`](local.word_body.font.md) |  | `Word.Font` | Gets the text format of the body. Use this to get and set font name, size, color and other properties. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`inlinePictures`](local.word_body.inlinepictures.md) |  | `Word.InlinePictureCollection` | Gets the collection of inlinePicture objects in the body. The collection does not include floating images. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`lists`](local.word_body.lists.md) |  | `Word.ListCollection` | Gets the collection of list objects in the body. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`paragraphs`](local.word_body.paragraphs.md) |  | `Word.ParagraphCollection` | Gets the collection of paragraph objects in the body. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentBody`](local.word_body.parentbody.md) |  | `Word.Body` | Gets the parent body of the body. For example, a table cell body's parent body could be a header. Throws if there isn't a parent body. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentBodyOrNullObject`](local.word_body.parentbodyornullobject.md) |  | `Word.Body` | Gets the parent body of the body. For example, a table cell body's parent body could be a header. Returns a null object if there isn't a parent body. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentContentControl`](local.word_body.parentcontentcontrol.md) |  | `Word.ContentControl` | Gets the content control that contains the body. Throws if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentContentControlOrNullObject`](local.word_body.parentcontentcontrolornullobject.md) |  | `Word.ContentControl` | Gets the content control that contains the body. Returns a null object if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentSection`](local.word_body.parentsection.md) |  | `Word.Section` | Gets the parent section of the body. Throws if there isn't a parent section. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentSectionOrNullObject`](local.word_body.parentsectionornullobject.md) |  | `Word.Section` | Gets the parent section of the body. Returns a null object if there isn't a parent section. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`style`](local.word_body.style.md) |  | `string` | Gets or sets the style name for the body. Use this property for custom styles and localized style names. To use the built-in styles that are portable between locales, see the "styleBuiltIn" property. <p/> \[Api set: WordApi 1.1\] |
|  [`styleBuiltIn`](local.word_body.stylebuiltin.md) |  | `string` | Gets or sets the built-in style name for the body. Use this property for built-in styles that are portable between locales. To use custom styles or localized style names, see the "style" property. <p/> \[Api set: WordApi 1.3\] |
|  [`tables`](local.word_body.tables.md) |  | `Word.TableCollection` | Gets the collection of table objects in the body. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`text`](local.word_body.text.md) |  | `string` | Gets the text of the body. Use the insertText method to insert text. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`type`](local.word_body.type.md) |  | `string` | Gets the type of the body. The type can be 'MainDoc', 'Section', 'Header', 'Footer', or 'TableCell'. Read-only. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.word_body.clear.md) |  | `void` | Clears the contents of the body object. The user can perform the undo operation on the cleared content. <p/> \[Api set: WordApi 1.1\] |
|  [`getHtml()`](local.word_body.gethtml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the HTML representation of the body object. <p/> \[Api set: WordApi 1.1\] |
|  [`getOoxml()`](local.word_body.getooxml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the OOXML (Office Open XML) representation of the body object. <p/> \[Api set: WordApi 1.1\] |
|  [`getRange(rangeLocation)`](local.word_body.getrange.md) |  | `Word.Range` | Gets the whole body, or the starting or ending point of the body, as a range. <p/> \[Api set: WordApi 1.3\] |
|  [`insertBreak(breakType, insertLocation)`](local.word_body.insertbreak.md) |  | `void` | Inserts a break at the specified location in the main document. The insertLocation value can be 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertContentControl()`](local.word_body.insertcontentcontrol.md) |  | `Word.ContentControl` | Wraps the body object with a Rich Text content control. <p/> \[Api set: WordApi 1.1\] |
|  [`insertFileFromBase64(base64File, insertLocation)`](local.word_body.insertfilefrombase64.md) |  | `Word.Range` | Inserts a document into the body at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertHtml(html, insertLocation)`](local.word_body.inserthtml.md) |  | `Word.Range` | Inserts HTML at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertInlinePictureFromBase64(base64EncodedImage, insertLocation)`](local.word_body.insertinlinepicturefrombase64.md) |  | `Word.InlinePicture` | Inserts a picture into the body at the specified location. The insertLocation value can be 'Start' or 'End'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertOoxml(ooxml, insertLocation)`](local.word_body.insertooxml.md) |  | `Word.Range` | Inserts OOXML at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_body.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertTable(rowCount, columnCount, insertLocation, values)`](local.word_body.inserttable.md) |  | `Word.Table` | Inserts a table with the specified number of rows and columns. The insertLocation value can be 'Start' or 'End'. <p/> \[Api set: WordApi 1.3\] |
|  [`insertText(text, insertLocation)`](local.word_body.inserttext.md) |  | `Word.Range` | Inserts text into the body at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`load(option)`](local.word_body.load.md) |  | `Word.Body` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`search(searchText, searchOptions)`](local.word_body.search.md) |  | `Word.RangeCollection` | Performs a search with the specified searchOptions on the scope of the body object. The search results are a collection of range objects. <p/> \[Api set: WordApi 1.1\] |
|  [`select(selectionMode)`](local.word_body.select.md) |  | `void` | Selects the body and navigates the Word UI to it. <p/> \[Api set: WordApi 1.1\] |
|  [`set(properties, options)`](local.word_body.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_body.tojson.md) |  | `{
            "font": Font;
            "style": string;
            "styleBuiltIn": string;
            "text": string;
            "type": string;
        }` |  |
|  [`track()`](local.word_body.track.md) |  | `Word.Body` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_body.untrack.md) |  | `Word.Body` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

