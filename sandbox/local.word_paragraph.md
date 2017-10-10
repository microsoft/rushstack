[Home](./index) &gt; [local](local.md) &gt; [Word\_Paragraph](local.word_paragraph.md)

# Word\_Paragraph class

Represents a single paragraph in a selection, range, content control, or document body. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`alignment`](local.word_paragraph.alignment.md) |  | `string` | Gets or sets the alignment for a paragraph. The value can be 'left', 'centered', 'right', or 'justified'. <p/> \[Api set: WordApi 1.1\] |
|  [`contentControls`](local.word_paragraph.contentcontrols.md) |  | `Word.ContentControlCollection` | Gets the collection of content control objects in the paragraph. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`firstLineIndent`](local.word_paragraph.firstlineindent.md) |  | `number` | Gets or sets the value, in points, for a first line or hanging indent. Use a positive value to set a first-line indent, and use a negative value to set a hanging indent. <p/> \[Api set: WordApi 1.1\] |
|  [`font`](local.word_paragraph.font.md) |  | `Word.Font` | Gets the text format of the paragraph. Use this to get and set font name, size, color, and other properties. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`inlinePictures`](local.word_paragraph.inlinepictures.md) |  | `Word.InlinePictureCollection` | Gets the collection of inlinePicture objects in the paragraph. The collection does not include floating images. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`isLastParagraph`](local.word_paragraph.islastparagraph.md) |  | `boolean` | Indicates the paragraph is the last one inside its parent body. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`isListItem`](local.word_paragraph.islistitem.md) |  | `boolean` | Checks whether the paragraph is a list item. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`leftIndent`](local.word_paragraph.leftindent.md) |  | `number` | Gets or sets the left indent value, in points, for the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`lineSpacing`](local.word_paragraph.linespacing.md) |  | `number` | Gets or sets the line spacing, in points, for the specified paragraph. In the Word UI, this value is divided by 12. <p/> \[Api set: WordApi 1.1\] |
|  [`lineUnitAfter`](local.word_paragraph.lineunitafter.md) |  | `number` | Gets or sets the amount of spacing, in grid lines. after the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`lineUnitBefore`](local.word_paragraph.lineunitbefore.md) |  | `number` | Gets or sets the amount of spacing, in grid lines, before the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`list`](local.word_paragraph.list.md) |  | `Word.List` | Gets the List to which this paragraph belongs. Throws if the paragraph is not in a list. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`listItem`](local.word_paragraph.listitem.md) |  | `Word.ListItem` | Gets the ListItem for the paragraph. Throws if the paragraph is not part of a list. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`listItemOrNullObject`](local.word_paragraph.listitemornullobject.md) |  | `Word.ListItem` | Gets the ListItem for the paragraph. Returns a null object if the paragraph is not part of a list. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`listOrNullObject`](local.word_paragraph.listornullobject.md) |  | `Word.List` | Gets the List to which this paragraph belongs. Returns a null object if the paragraph is not in a list. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`outlineLevel`](local.word_paragraph.outlinelevel.md) |  | `number` | Gets or sets the outline level for the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`parentBody`](local.word_paragraph.parentbody.md) |  | `Word.Body` | Gets the parent body of the paragraph. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentContentControl`](local.word_paragraph.parentcontentcontrol.md) |  | `Word.ContentControl` | Gets the content control that contains the paragraph. Throws if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.1\] |
|  [`parentContentControlOrNullObject`](local.word_paragraph.parentcontentcontrolornullobject.md) |  | `Word.ContentControl` | Gets the content control that contains the paragraph. Returns a null object if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_paragraph.parenttable.md) |  | `Word.Table` | Gets the table that contains the paragraph. Throws if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCell`](local.word_paragraph.parenttablecell.md) |  | `Word.TableCell` | Gets the table cell that contains the paragraph. Throws if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCellOrNullObject`](local.word_paragraph.parenttablecellornullobject.md) |  | `Word.TableCell` | Gets the table cell that contains the paragraph. Returns a null object if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableOrNullObject`](local.word_paragraph.parenttableornullobject.md) |  | `Word.Table` | Gets the table that contains the paragraph. Returns a null object if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`rightIndent`](local.word_paragraph.rightindent.md) |  | `number` | Gets or sets the right indent value, in points, for the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`spaceAfter`](local.word_paragraph.spaceafter.md) |  | `number` | Gets or sets the spacing, in points, after the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`spaceBefore`](local.word_paragraph.spacebefore.md) |  | `number` | Gets or sets the spacing, in points, before the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`style`](local.word_paragraph.style.md) |  | `string` | Gets or sets the style name for the paragraph. Use this property for custom styles and localized style names. To use the built-in styles that are portable between locales, see the "styleBuiltIn" property. <p/> \[Api set: WordApi 1.1\] |
|  [`styleBuiltIn`](local.word_paragraph.stylebuiltin.md) |  | `string` | Gets or sets the built-in style name for the paragraph. Use this property for built-in styles that are portable between locales. To use custom styles or localized style names, see the "style" property. <p/> \[Api set: WordApi 1.3\] |
|  [`tableNestingLevel`](local.word_paragraph.tablenestinglevel.md) |  | `number` | Gets the level of the paragraph's table. It returns 0 if the paragraph is not in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`text`](local.word_paragraph.text.md) |  | `string` | Gets the text of the paragraph. Read-only. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`attachToList(listId, level)`](local.word_paragraph.attachtolist.md) |  | `Word.List` | Lets the paragraph join an existing list at the specified level. Fails if the paragraph cannot join the list or if the paragraph is already a list item. <p/> \[Api set: WordApi 1.3\] |
|  [`clear()`](local.word_paragraph.clear.md) |  | `void` | Clears the contents of the paragraph object. The user can perform the undo operation on the cleared content. <p/> \[Api set: WordApi 1.1\] |
|  [`delete()`](local.word_paragraph.delete.md) |  | `void` | Deletes the paragraph and its content from the document. <p/> \[Api set: WordApi 1.1\] |
|  [`detachFromList()`](local.word_paragraph.detachfromlist.md) |  | `void` | Moves this paragraph out of its list, if the paragraph is a list item. <p/> \[Api set: WordApi 1.3\] |
|  [`getHtml()`](local.word_paragraph.gethtml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the HTML representation of the paragraph object. <p/> \[Api set: WordApi 1.1\] |
|  [`getNext()`](local.word_paragraph.getnext.md) |  | `Word.Paragraph` | Gets the next paragraph. Throws if the paragraph is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextOrNullObject()`](local.word_paragraph.getnextornullobject.md) |  | `Word.Paragraph` | Gets the next paragraph. Returns a null object if the paragraph is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getOoxml()`](local.word_paragraph.getooxml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the Office Open XML (OOXML) representation of the paragraph object. <p/> \[Api set: WordApi 1.1\] |
|  [`getPrevious()`](local.word_paragraph.getprevious.md) |  | `Word.Paragraph` | Gets the previous paragraph. Throws if the paragraph is the first one. <p/> \[Api set: WordApi 1.3\] |
|  [`getPreviousOrNullObject()`](local.word_paragraph.getpreviousornullobject.md) |  | `Word.Paragraph` | Gets the previous paragraph. Returns a null object if the paragraph is the first one. <p/> \[Api set: WordApi 1.3\] |
|  [`getRange(rangeLocation)`](local.word_paragraph.getrange.md) |  | `Word.Range` | Gets the whole paragraph, or the starting or ending point of the paragraph, as a range. <p/> \[Api set: WordApi 1.3\] |
|  [`getTextRanges(endingMarks, trimSpacing)`](local.word_paragraph.gettextranges.md) |  | `Word.RangeCollection` | Gets the text ranges in the paragraph by using punctuation marks and/or other ending marks. <p/> \[Api set: WordApi 1.3\] |
|  [`insertBreak(breakType, insertLocation)`](local.word_paragraph.insertbreak.md) |  | `void` | Inserts a break at the specified location in the main document. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertContentControl()`](local.word_paragraph.insertcontentcontrol.md) |  | `Word.ContentControl` | Wraps the paragraph object with a rich text content control. <p/> \[Api set: WordApi 1.1\] |
|  [`insertFileFromBase64(base64File, insertLocation)`](local.word_paragraph.insertfilefrombase64.md) |  | `Word.Range` | Inserts a document into the paragraph at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertHtml(html, insertLocation)`](local.word_paragraph.inserthtml.md) |  | `Word.Range` | Inserts HTML into the paragraph at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertInlinePictureFromBase64(base64EncodedImage, insertLocation)`](local.word_paragraph.insertinlinepicturefrombase64.md) |  | `Word.InlinePicture` | Inserts a picture into the paragraph at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertOoxml(ooxml, insertLocation)`](local.word_paragraph.insertooxml.md) |  | `Word.Range` | Inserts OOXML into the paragraph at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_paragraph.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.1\] |
|  [`insertTable(rowCount, columnCount, insertLocation, values)`](local.word_paragraph.inserttable.md) |  | `Word.Table` | Inserts a table with the specified number of rows and columns. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.3\] |
|  [`insertText(text, insertLocation)`](local.word_paragraph.inserttext.md) |  | `Word.Range` | Inserts text into the paragraph at the specified location. The insertLocation value can be 'Replace', 'Start' or 'End'. <p/> \[Api set: WordApi 1.1\] |
|  [`load(option)`](local.word_paragraph.load.md) |  | `Word.Paragraph` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`search(searchText, searchOptions)`](local.word_paragraph.search.md) |  | `Word.RangeCollection` | Performs a search with the specified searchOptions on the scope of the paragraph object. The search results are a collection of range objects. <p/> \[Api set: WordApi 1.1\] |
|  [`select(selectionMode)`](local.word_paragraph.select.md) |  | `void` | Selects and navigates the Word UI to the paragraph. <p/> \[Api set: WordApi 1.1\] |
|  [`set(properties, options)`](local.word_paragraph.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`split(delimiters, trimDelimiters, trimSpacing)`](local.word_paragraph.split.md) |  | `Word.RangeCollection` | Splits the paragraph into child ranges by using delimiters. <p/> \[Api set: WordApi 1.3\] |
|  [`startNewList()`](local.word_paragraph.startnewlist.md) |  | `Word.List` | Starts a new list with this paragraph. Fails if the paragraph is already a list item. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_paragraph.tojson.md) |  | `{
            "alignment": string;
            "firstLineIndent": number;
            "font": Font;
            "isLastParagraph": boolean;
            "isListItem": boolean;
            "leftIndent": number;
            "lineSpacing": number;
            "lineUnitAfter": number;
            "lineUnitBefore": number;
            "listItem": ListItem;
            "listItemOrNullObject": ListItem;
            "outlineLevel": number;
            "rightIndent": number;
            "spaceAfter": number;
            "spaceBefore": number;
            "style": string;
            "styleBuiltIn": string;
            "tableNestingLevel": number;
            "text": string;
        }` |  |
|  [`track()`](local.word_paragraph.track.md) |  | `Word.Paragraph` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_paragraph.untrack.md) |  | `Word.Paragraph` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

