[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkWord](local.onenote_inkword.md)

# OneNote\_InkWord class

A container for the ink in a word in a paragraph. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_inkword.id.md) |  | `string` | Gets the ID of the InkWord object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`languageId`](local.onenote_inkword.languageid.md) |  | `string` | The id of the recognized language in this ink word. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraph`](local.onenote_inkword.paragraph.md) |  | `OneNote.Paragraph` | The parent paragraph containing the ink word. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`wordAlternates`](local.onenote_inkword.wordalternates.md) |  | `Array<string>` | The words that were recognized in this ink word, in order of likelihood. Read-only. <p/> \[Api set: OneNoteApi\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_inkword.load.md) |  | `OneNote.InkWord` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

