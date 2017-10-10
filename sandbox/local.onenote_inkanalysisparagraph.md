[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysisParagraph](local.onenote_inkanalysisparagraph.md)

# OneNote\_InkAnalysisParagraph class

Represents ink analysis data for an identified paragraph formed by ink strokes. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_inkanalysisparagraph.id.md) |  | `string` | Gets the ID of the InkAnalysisParagraph object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`inkAnalysis`](local.onenote_inkanalysisparagraph.inkanalysis.md) |  | `OneNote.InkAnalysis` | Reference to the parent InkAnalysisPage. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`lines`](local.onenote_inkanalysisparagraph.lines.md) |  | `OneNote.InkAnalysisLineCollection` | Gets the ink analysis lines in this ink analysis paragraph. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_inkanalysisparagraph.load.md) |  | `OneNote.InkAnalysisParagraph` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

