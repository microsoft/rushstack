[Home](./index) &gt; [local](local.md) &gt; [Word\_List](local.word_list.md)

# Word\_List class

Contains a collection of \[paragraph\](paragraph.md) objects. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.word_list.id.md) |  | `number` | Gets the list's id. <p/> \[Api set: WordApi 1.3\] |
|  [`levelExistences`](local.word_list.levelexistences.md) |  | `Array<boolean>` | Checks whether each of the 9 levels exists in the list. A true value indicates the level exists, which means there is at least one list item at that level. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`levelTypes`](local.word_list.leveltypes.md) |  | `Array<string>` | Gets all 9 level types in the list. Each type can be 'Bullet', 'Number' or 'Picture'. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`paragraphs`](local.word_list.paragraphs.md) |  | `Word.ParagraphCollection` | Gets paragraphs in the list. Read-only. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getLevelParagraphs(level)`](local.word_list.getlevelparagraphs.md) |  | `Word.ParagraphCollection` | Gets the paragraphs that occur at the specified level in the list. <p/> \[Api set: WordApi 1.3\] |
|  [`getLevelString(level)`](local.word_list.getlevelstring.md) |  | `OfficeExtension.ClientResult<string>` | Gets the bullet, number or picture at the specified level as a string. <p/> \[Api set: WordApi 1.3\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_list.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Start', 'End', 'Before' or 'After'. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_list.load.md) |  | `Word.List` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`setLevelAlignment(level, alignment)`](local.word_list.setlevelalignment.md) |  | `void` | Sets the alignment of the bullet, number or picture at the specified level in the list. <p/> \[Api set: WordApi 1.3\] |
|  [`setLevelBullet(level, listBullet, charCode, fontName)`](local.word_list.setlevelbullet.md) |  | `void` | Sets the bullet format at the specified level in the list. If the bullet is 'Custom', the charCode is required. <p/> \[Api set: WordApi 1.3\] |
|  [`setLevelIndents(level, textIndent, bulletNumberPictureIndent)`](local.word_list.setlevelindents.md) |  | `void` | Sets the two indents of the specified level in the list. <p/> \[Api set: WordApi 1.3\] |
|  [`setLevelNumbering(level, listNumbering, formatString)`](local.word_list.setlevelnumbering.md) |  | `void` | Sets the numbering format at the specified level in the list. <p/> \[Api set: WordApi 1.3\] |
|  [`setLevelStartingNumber(level, startingNumber)`](local.word_list.setlevelstartingnumber.md) |  | `void` | Sets the starting number at the specified level in the list. Default value is 1. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_list.tojson.md) |  | `{
            "id": number;
            "levelExistences": boolean[];
            "levelTypes": string[];
        }` |  |
|  [`track()`](local.word_list.track.md) |  | `Word.List` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_list.untrack.md) |  | `Word.List` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

