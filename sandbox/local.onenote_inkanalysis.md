[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysis](local.onenote_inkanalysis.md)

# OneNote\_InkAnalysis class

Represents ink analysis data for a given set of ink strokes. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_inkanalysis.id.md) |  | `string` | Gets the ID of the InkAnalysis object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`page`](local.onenote_inkanalysis.page.md) |  | `OneNote.Page` | Gets the parent page object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraphs`](local.onenote_inkanalysis.paragraphs.md) |  | `OneNote.InkAnalysisParagraphCollection` | Gets the ink analysis paragraphs in this page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_inkanalysis.load.md) |  | `OneNote.InkAnalysis` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

