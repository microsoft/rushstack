[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysisLine](local.onenote_inkanalysisline.md)

# OneNote\_InkAnalysisLine class

Represents ink analysis data for an identified text line formed by ink strokes. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_inkanalysisline.id.md) |  | `string` | Gets the ID of the InkAnalysisLine object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraph`](local.onenote_inkanalysisline.paragraph.md) |  | `OneNote.InkAnalysisParagraph` | Reference to the parent InkAnalysisParagraph. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`words`](local.onenote_inkanalysisline.words.md) |  | `OneNote.InkAnalysisWordCollection` | Gets the ink analysis words in this ink analysis line. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_inkanalysisline.load.md) |  | `OneNote.InkAnalysisLine` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

