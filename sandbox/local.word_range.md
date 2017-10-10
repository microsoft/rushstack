[Home](./index) &gt; [local](local.md) &gt; [Word\_Range](local.word_range.md)

# Word\_Range class

Represents a contiguous area in a document. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`contentControls`](local.word_range.contentcontrols.md) |  | `Word.ContentControlCollection` | Gets the collection of content control objects in the range. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`font`](local.word_range.font.md) |  | `Word.Font` | Gets the text format of the range. Use this to get and set font name, size, color, and other properties. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`hyperlink`](local.word_range.hyperlink.md) |  | `string` | Gets the first hyperlink in the range, or sets a hyperlink on the range. All hyperlinks in the range are deleted when you set a new hyperlink on the range. Use a '\#' to separate the address part from the optional location part. <p/> \[Api set: WordApi 1.3\] |
|  [`inlinePictures`](local.word_range.inlinepictures.md) |  | `Word.InlinePictureCollection` | Gets the collection of inline picture objects in the range. Read-only. <p/> \[Api set: WordApi 1.2\] |
|  [`isEmpty`](local.word_range.isempty.md) |  | `boolean` | Checks whether the range length is zero. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`lists`](local.word_range.lists.md) |  | `Word.ListCollection` | Gets the collection of list objects in the range. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`paragraphs`](local.word_range.paragraphs.md) |  | `Word.ParagraphCollection` | Gets the collection of paragraph objects in the range. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentBody`](local.word_range.parentbody.md) |  | `Word.Body` | Gets the parent body of the range. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentContentControl`](local.word_range.parentcontentcontrol.md) |  | `Word.ContentControl` | Gets the content control that contains the range. Throws if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentContentControlOrNullObject`](local.word_range.parentcontentcontrolornullobject.md) |  | `Word.ContentControl` | Gets the content control that contains the range. Returns a null object if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_range.parenttable.md) |  | `Word.Table` | Gets the table that contains the range. Throws if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCell`](local.word_range.parenttablecell.md) |  | `Word.TableCell` | Gets the table cell that contains the range. Throws if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCellOrNullObject`](local.word_range.parenttablecellornullobject.md) |  | `Word.TableCell` | Gets the table cell that contains the range. Returns a null object if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableOrNullObject`](local.word_range.parenttableornullobject.md) |  | `Word.Table` | Gets the table that contains the range. Returns a null object if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`style`](local.word_range.style.md) |  | `string` | Gets or sets the style name for the range. Use this property for custom styles and localized style names. To use the built-in styles that are portable between locales, see the "styleBuiltIn" property. <p/> \[Api set: WordApi 1.1\] |
|  [`styleBuiltIn`](local.word_range.stylebuiltin.md) |  | `string` | Gets or sets the built-in style name for the range. Use this property for built-in styles that are portable between locales. To use custom styles or localized style names, see the "style" property. <p/> \[Api set: WordApi 1.3\] |
|  [`tables`](local.word_range.tables.md) |  | `Word.TableCollection` | Gets the collection of table objects in the range. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`text`](local.word_range.text.md) |  | `string` | Gets the text of the range. Read-only. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.word_range.clear.md) |  | `void` | Clears the contents of the range object. The user can perform the undo operation on the cleared content. <p/> \[Api set: WordApi 1.1\] |
|  [`compareLocationWith(range)`](local.word_range.comparelocationwith.md) |  | `OfficeExtension.ClientResult<string>` | Compares this range's location with another range's location. <p/> \[Api set: WordApi 1.3\] |
|  [`delete()`](local.word_range.delete.md) |  | `void` | Deletes the range and its content from the document. <p/> \[Api set: WordApi 1.1\] |
|  [`expandTo(range)`](local.word_range.expandto.md) |  | `Word.Range` | Returns a new range that extends from this range in either direction to cover another range. This range is not changed. Throws if the two ranges do not have a union. <p/> \[Api set: WordApi 1.3\] |
|  [`expandToOrNullObject(range)`](local.word_range.expandtoornullobject.md) |  | `Word.Range` | Returns a new range that extends from this range in either direction to cover another range. This range is not changed. Returns a null object if the two ranges do not have a union. <p/> \[Api set: WordApi 1.3\] |
|  [`getHtml()`](local.word_range.gethtml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the HTML representation of the range object. <p/> \[Api set: WordApi 1.1\] |
|  [`getHyperlinkRanges()`](local.word_range.gethyperlinkranges.md) |  | `Word.RangeCollection` | Gets hyperlink child ranges within the range. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextTextRange(endingMarks, trimSpacing)`](local.word_range.getnexttextrange.md) |  | `Word.Range` | Gets the next text range by using punctuation marks and/or other ending marks. Throws if this text range is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextTextRangeOrNullObject(endingMarks, trimSpacing)`](local.word_range.getnexttextrangeornullobject.md) |  | `Word.Range` | Gets the next text range by using punctuation marks and/or other ending marks. Returns a null object if this text range is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getOoxml()`](local.word_range.getooxml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the OOXML representation of the range object. <p/> \[Api set: WordApi 1.1\] |
|  [`getRange(rangeLocation)`](local.word_range.getrange.md) |  | `Word.Range` | Clones the range, or gets the starting or ending point of the range as a new range. <p/> \[Api set: WordApi 1.3\] |
|  [`getTextRanges(endingMarks, trimSpacing)`](local.word_range.gettextranges.md) |  | `Word.RangeCollection` | Gets the text child ranges in the range by using punctuation marks and/or other ending marks. <p/> \[Api set: WordApi 1.3\] |
|  [`insertBreak(breakType, insertLocation)`](local.word_range.insertbreak.md) |  | `void` | Inserts a break at the specified location in the main document. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertContentControl()`](local.word_range.insertcontentcontrol.md) |  | `Word.ContentControl` | Wraps the range object with a rich text content control. <p/> \[Api set: WordApi 1.1\] |
|  [`insertFileFromBase64(base64File, insertLocation)`](local.word_range.insertfilefrombase64.md) |  | `Word.Range` | Inserts a document at the specified location. The insertLocation value can be 'Replace', 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertHtml(html, insertLocation)`](local.word_range.inserthtml.md) |  | `Word.Range` | Inserts HTML at the specified location. The insertLocation value can be 'Replace', 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertInlinePictureFromBase64(base64EncodedImage, insertLocation)`](local.word_range.insertinlinepicturefrombase64.md) |  | `Word.InlinePicture` | Inserts a picture at the specified location. The insertLocation value can be 'Replace', 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.2\] |
|  [`insertOoxml(ooxml, insertLocation)`](local.word_range.insertooxml.md) |  | `Word.Range` | Inserts OOXML at the specified location. The insertLocation value can be 'Replace', 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_range.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertTable(rowCount, columnCount, insertLocation, values)`](local.word_range.inserttable.md) |  | `Word.Table` | Inserts a table with the specified number of rows and columns. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.3\] |
|  [`insertText(text, insertLocation)`](local.word_range.inserttext.md) |  | `Word.Range` | Inserts text at the specified location. The insertLocation value can be 'Replace', 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`intersectWith(range)`](local.word_range.intersectwith.md) |  | `Word.Range` | Returns a new range as the intersection of this range with another range. This range is not changed. Throws if the two ranges are not overlapped or adjacent. <p/> \[Api set: WordApi 1.3\] |
|  [`intersectWithOrNullObject(range)`](local.word_range.intersectwithornullobject.md) |  | `Word.Range` | Returns a new range as the intersection of this range with another range. This range is not changed. Returns a null object if the two ranges are not overlapped or adjacent. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_range.load.md) |  | `Word.Range` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`search(searchText, searchOptions)`](local.word_range.search.md) |  | `Word.RangeCollection` | Performs a search with the specified searchOptions on the scope of the range object. The search results are a collection of range objects. <p/> \[Api set: WordApi 1.1\] |
|  [`select(selectionMode)`](local.word_range.select.md) |  | `void` | Selects and navigates the Word UI to the range. <p/> \[Api set: WordApi 1.1\] |
|  [`set(properties, options)`](local.word_range.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`split(delimiters, multiParagraphs, trimDelimiters, trimSpacing)`](local.word_range.split.md) |  | `Word.RangeCollection` | Splits the range into child ranges by using delimiters. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_range.tojson.md) |  | `{
            "font": Font;
            "hyperlink": string;
            "isEmpty": boolean;
            "style": string;
            "styleBuiltIn": string;
            "text": string;
        }` |  |
|  [`track()`](local.word_range.track.md) |  | `Word.Range` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_range.untrack.md) |  | `Word.Range` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

