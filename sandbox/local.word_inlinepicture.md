[Home](./index) &gt; [local](local.md) &gt; [Word\_InlinePicture](local.word_inlinepicture.md)

# Word\_InlinePicture class

Represents an inline picture. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`altTextDescription`](local.word_inlinepicture.alttextdescription.md) |  | `string` | Gets or sets a string that represents the alternative text associated with the inline image <p/> \[Api set: WordApi 1.1\] |
|  [`altTextTitle`](local.word_inlinepicture.alttexttitle.md) |  | `string` | Gets or sets a string that contains the title for the inline image. <p/> \[Api set: WordApi 1.1\] |
|  [`height`](local.word_inlinepicture.height.md) |  | `number` | Gets or sets a number that describes the height of the inline image. <p/> \[Api set: WordApi 1.1\] |
|  [`hyperlink`](local.word_inlinepicture.hyperlink.md) |  | `string` | Gets or sets a hyperlink on the image. Use a '\#' to separate the address part from the optional location part. <p/> \[Api set: WordApi 1.1\] |
|  [`lockAspectRatio`](local.word_inlinepicture.lockaspectratio.md) |  | `boolean` | Gets or sets a value that indicates whether the inline image retains its original proportions when you resize it. <p/> \[Api set: WordApi 1.1\] |
|  [`paragraph`](local.word_inlinepicture.paragraph.md) |  | `Word.Paragraph` | Gets the parent paragraph that contains the inline image. Read-only. <p/> \[Api set: WordApi 1.2\] |
|  [`parentContentControl`](local.word_inlinepicture.parentcontentcontrol.md) |  | `Word.ContentControl` | Gets the content control that contains the inline image. Throws if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentContentControlOrNullObject`](local.word_inlinepicture.parentcontentcontrolornullobject.md) |  | `Word.ContentControl` | Gets the content control that contains the inline image. Returns a null object if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_inlinepicture.parenttable.md) |  | `Word.Table` | Gets the table that contains the inline image. Throws if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCell`](local.word_inlinepicture.parenttablecell.md) |  | `Word.TableCell` | Gets the table cell that contains the inline image. Throws if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCellOrNullObject`](local.word_inlinepicture.parenttablecellornullobject.md) |  | `Word.TableCell` | Gets the table cell that contains the inline image. Returns a null object if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableOrNullObject`](local.word_inlinepicture.parenttableornullobject.md) |  | `Word.Table` | Gets the table that contains the inline image. Returns a null object if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`width`](local.word_inlinepicture.width.md) |  | `number` | Gets or sets a number that describes the width of the inline image. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.word_inlinepicture.delete.md) |  | `void` | Deletes the inline picture from the document. <p/> \[Api set: WordApi 1.2\] |
|  [`getBase64ImageSrc()`](local.word_inlinepicture.getbase64imagesrc.md) |  | `OfficeExtension.ClientResult<string>` | Gets the base64 encoded string representation of the inline image. <p/> \[Api set: WordApi 1.1\] |
|  [`getNext()`](local.word_inlinepicture.getnext.md) |  | `Word.InlinePicture` | Gets the next inline image. Throws if this inline image is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextOrNullObject()`](local.word_inlinepicture.getnextornullobject.md) |  | `Word.InlinePicture` | Gets the next inline image. Returns a null object if this inline image is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getRange(rangeLocation)`](local.word_inlinepicture.getrange.md) |  | `Word.Range` | Gets the picture, or the starting or ending point of the picture, as a range. <p/> \[Api set: WordApi 1.3\] |
|  [`insertBreak(breakType, insertLocation)`](local.word_inlinepicture.insertbreak.md) |  | `void` | Inserts a break at the specified location in the main document. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertContentControl()`](local.word_inlinepicture.insertcontentcontrol.md) |  | `Word.ContentControl` | Wraps the inline picture with a rich text content control. <p/> \[Api set: WordApi 1.1\] |
|  [`insertFileFromBase64(base64File, insertLocation)`](local.word_inlinepicture.insertfilefrombase64.md) |  | `Word.Range` | Inserts a document at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertHtml(html, insertLocation)`](local.word_inlinepicture.inserthtml.md) |  | `Word.Range` | Inserts HTML at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertInlinePictureFromBase64(base64EncodedImage, insertLocation)`](local.word_inlinepicture.insertinlinepicturefrombase64.md) |  | `Word.InlinePicture` | Inserts an inline picture at the specified location. The insertLocation value can be 'Replace', 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertOoxml(ooxml, insertLocation)`](local.word_inlinepicture.insertooxml.md) |  | `Word.Range` | Inserts OOXML at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_inlinepicture.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertText(text, insertLocation)`](local.word_inlinepicture.inserttext.md) |  | `Word.Range` | Inserts text at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`load(option)`](local.word_inlinepicture.load.md) |  | `Word.InlinePicture` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`select(selectionMode)`](local.word_inlinepicture.select.md) |  | `void` | Selects the inline picture. This causes Word to scroll to the selection. <p/> \[Api set: WordApi 1.2\] |
|  [`set(properties, options)`](local.word_inlinepicture.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_inlinepicture.tojson.md) |  | `{
            "altTextDescription": string;
            "altTextTitle": string;
            "height": number;
            "hyperlink": string;
            "lockAspectRatio": boolean;
            "width": number;
        }` |  |
|  [`track()`](local.word_inlinepicture.track.md) |  | `Word.InlinePicture` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_inlinepicture.untrack.md) |  | `Word.InlinePicture` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

