[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysisWord](local.onenote_inkanalysisword.md)

# OneNote\_InkAnalysisWord class

Represents ink analysis data for an identified word formed by ink strokes. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_inkanalysisword.id.md) |  | `string` | Gets the ID of the InkAnalysisWord object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`languageId`](local.onenote_inkanalysisword.languageid.md) |  | `string` | The id of the recognized language in this inkAnalysisWord. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`line`](local.onenote_inkanalysisword.line.md) |  | `OneNote.InkAnalysisLine` | Reference to the parent InkAnalysisLine. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`strokePointers`](local.onenote_inkanalysisword.strokepointers.md) |  | `Array<OneNote.InkStrokePointer>` | Weak references to the ink strokes that were recognized as part of this ink analysis word. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`wordAlternates`](local.onenote_inkanalysisword.wordalternates.md) |  | `Array<string>` | The words that were recognized in this ink word, in order of likelihood. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_inkanalysisword.load.md) |  | `OneNote.InkAnalysisWord` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

