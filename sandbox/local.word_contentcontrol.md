[Home](./index) &gt; [local](local.md) &gt; [Word\_ContentControl](local.word_contentcontrol.md)

# Word\_ContentControl class

Represents a content control. Content controls are bounded and potentially labeled regions in a document that serve as containers for specific types of content. Individual content controls may contain contents such as images, tables, or paragraphs of formatted text. Currently, only rich text content controls are supported. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`appearance`](local.word_contentcontrol.appearance.md) |  | `string` | Gets or sets the appearance of the content control. The value can be 'boundingBox', 'tags' or 'hidden'. <p/> \[Api set: WordApi 1.1\] |
|  [`cannotDelete`](local.word_contentcontrol.cannotdelete.md) |  | `boolean` | Gets or sets a value that indicates whether the user can delete the content control. Mutually exclusive with removeWhenEdited. <p/> \[Api set: WordApi 1.1\] |
|  [`cannotEdit`](local.word_contentcontrol.cannotedit.md) |  | `boolean` | Gets or sets a value that indicates whether the user can edit the contents of the content control. <p/> \[Api set: WordApi 1.1\] |
|  [`color`](local.word_contentcontrol.color.md) |  | `string` | Gets or sets the color of the content control. Color is specified in '\#RRGGBB' format or by using the color name. <p/> \[Api set: WordApi 1.1\] |
|  [`contentControls`](local.word_contentcontrol.contentcontrols.md) |  | `Word.ContentControlCollection` | Gets the collection of content control objects in the content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`font`](local.word_contentcontrol.font.md) |  | `Word.Font` | Gets the text format of the content control. Use this to get and set font name, size, color, and other properties. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`id`](local.word_contentcontrol.id.md) |  | `number` | Gets an integer that represents the content control identifier. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`inlinePictures`](local.word_contentcontrol.inlinepictures.md) |  | `Word.InlinePictureCollection` | Gets the collection of inlinePicture objects in the content control. The collection does not include floating images. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`lists`](local.word_contentcontrol.lists.md) |  | `Word.ListCollection` | Gets the collection of list objects in the content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`paragraphs`](local.word_contentcontrol.paragraphs.md) |  | `Word.ParagraphCollection` | Get the collection of paragraph objects in the content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentBody`](local.word_contentcontrol.parentbody.md) |  | `Word.Body` | Gets the parent body of the content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentContentControl`](local.word_contentcontrol.parentcontentcontrol.md) |  | `Word.ContentControl` | Gets the content control that contains the content control. Throws if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentContentControlOrNullObject`](local.word_contentcontrol.parentcontentcontrolornullobject.md) |  | `Word.ContentControl` | Gets the content control that contains the content control. Returns a null object if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_contentcontrol.parenttable.md) |  | `Word.Table` | Gets the table that contains the content control. Throws if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCell`](local.word_contentcontrol.parenttablecell.md) |  | `Word.TableCell` | Gets the table cell that contains the content control. Throws if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCellOrNullObject`](local.word_contentcontrol.parenttablecellornullobject.md) |  | `Word.TableCell` | Gets the table cell that contains the content control. Returns a null object if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableOrNullObject`](local.word_contentcontrol.parenttableornullobject.md) |  | `Word.Table` | Gets the table that contains the content control. Returns a null object if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`placeholderText`](local.word_contentcontrol.placeholdertext.md) |  | `string` | Gets or sets the placeholder text of the content control. Dimmed text will be displayed when the content control is empty. <p/> \[Api set: WordApi 1.1\] |
|  [`removeWhenEdited`](local.word_contentcontrol.removewhenedited.md) |  | `boolean` | Gets or sets a value that indicates whether the content control is removed after it is edited. Mutually exclusive with cannotDelete. <p/> \[Api set: WordApi 1.1\] |
|  [`style`](local.word_contentcontrol.style.md) |  | `string` | Gets or sets the style name for the content control. Use this property for custom styles and localized style names. To use the built-in styles that are portable between locales, see the "styleBuiltIn" property. <p/> \[Api set: WordApi 1.1\] |
|  [`styleBuiltIn`](local.word_contentcontrol.stylebuiltin.md) |  | `string` | Gets or sets the built-in style name for the content control. Use this property for built-in styles that are portable between locales. To use custom styles or localized style names, see the "style" property. <p/> \[Api set: WordApi 1.3\] |
|  [`subtype`](local.word_contentcontrol.subtype.md) |  | `string` | Gets the content control subtype. The subtype can be 'RichTextInline', 'RichTextParagraphs', 'RichTextTableCell', 'RichTextTableRow' and 'RichTextTable' for rich text content controls. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`tables`](local.word_contentcontrol.tables.md) |  | `Word.TableCollection` | Gets the collection of table objects in the content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`tag`](local.word_contentcontrol.tag.md) |  | `string` | Gets or sets a tag to identify a content control. <p/> \[Api set: WordApi 1.1\] |
|  [`text`](local.word_contentcontrol.text.md) |  | `string` | Gets the text of the content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`title`](local.word_contentcontrol.title.md) |  | `string` | Gets or sets the title for a content control. <p/> \[Api set: WordApi 1.1\] |
|  [`type`](local.word_contentcontrol.type.md) |  | `string` | Gets the content control type. Only rich text content controls are supported currently. Read-only. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.word_contentcontrol.clear.md) |  | `void` | Clears the contents of the content control. The user can perform the undo operation on the cleared content. <p/> \[Api set: WordApi 1.1\] |
|  [`delete(keepContent)`](local.word_contentcontrol.delete.md) |  | `void` | Deletes the content control and its content. If keepContent is set to true, the content is not deleted. <p/> \[Api set: WordApi 1.1\] |
|  [`getHtml()`](local.word_contentcontrol.gethtml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the HTML representation of the content control object. <p/> \[Api set: WordApi 1.1\] |
|  [`getOoxml()`](local.word_contentcontrol.getooxml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the Office Open XML (OOXML) representation of the content control object. <p/> \[Api set: WordApi 1.1\] |
|  [`getRange(rangeLocation)`](local.word_contentcontrol.getrange.md) |  | `Word.Range` | Gets the whole content control, or the starting or ending point of the content control, as a range. <p/> \[Api set: WordApi 1.3\] |
|  [`getTextRanges(endingMarks, trimSpacing)`](local.word_contentcontrol.gettextranges.md) |  | `Word.RangeCollection` | Gets the text ranges in the content control by using punctuation marks and/or other ending marks. <p/> \[Api set: WordApi 1.3\] |
|  [`insertBreak(breakType, insertLocation)`](local.word_contentcontrol.insertbreak.md) |  | `void` | Inserts a break at the specified location in the main document. The insertLocation value can be 'Start', 'End', 'Before' or 'After'. This method cannot be used with 'RichTextTable', 'RichTextTableRow' and 'RichTextTableCell' content controls. <p/> \[Api set: WordApi 1.1\] |
|  [`insertFileFromBase64(base64File, insertLocation)`](local.word_contentcontrol.insertfilefrombase64.md) |  | `Word.Range` | Inserts a document into the content control at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertHtml(html, insertLocation)`](local.word_contentcontrol.inserthtml.md) |  | `Word.Range` | Inserts HTML into the content control at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertInlinePictureFromBase64(base64EncodedImage, insertLocation)`](local.word_contentcontrol.insertinlinepicturefrombase64.md) |  | `Word.InlinePicture` | Inserts an inline picture into the content control at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertOoxml(ooxml, insertLocation)`](local.word_contentcontrol.insertooxml.md) |  | `Word.Range` | Inserts OOXML into the content control at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_contentcontrol.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertTable(rowCount, columnCount, insertLocation, values)`](local.word_contentcontrol.inserttable.md) |  | `Word.Table` | Inserts a table with the specified number of rows and columns into, or next to, a content control. The insertLocation value can be 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.3\] |
|  [`insertText(text, insertLocation)`](local.word_contentcontrol.inserttext.md) |  | `Word.Range` | Inserts text into the content control at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`load(option)`](local.word_contentcontrol.load.md) |  | `Word.ContentControl` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`search(searchText, searchOptions)`](local.word_contentcontrol.search.md) |  | `Word.RangeCollection` | Performs a search with the specified searchOptions on the scope of the content control object. The search results are a collection of range objects. <p/> \[Api set: WordApi 1.1\] |
|  [`select(selectionMode)`](local.word_contentcontrol.select.md) |  | `void` | Selects the content control. This causes Word to scroll to the selection. <p/> \[Api set: WordApi 1.1\] |
|  [`set(properties, options)`](local.word_contentcontrol.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`split(delimiters, multiParagraphs, trimDelimiters, trimSpacing)`](local.word_contentcontrol.split.md) |  | `Word.RangeCollection` | Splits the content control into child ranges by using delimiters. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_contentcontrol.tojson.md) |  | `{
            "appearance": string;
            "cannotDelete": boolean;
            "cannotEdit": boolean;
            "color": string;
            "font": Font;
            "id": number;
            "placeholderText": string;
            "removeWhenEdited": boolean;
            "style": string;
            "styleBuiltIn": string;
            "subtype": string;
            "tag": string;
            "text": string;
            "title": string;
            "type": string;
        }` |  |
|  [`track()`](local.word_contentcontrol.track.md) |  | `Word.ContentControl` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_contentcontrol.untrack.md) |  | `Word.ContentControl` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

