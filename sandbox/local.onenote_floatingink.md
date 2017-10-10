[Home](./index) &gt; [local](local.md) &gt; [OneNote\_FloatingInk](local.onenote_floatingink.md)

# OneNote\_FloatingInk class

Represents a group of ink strokes. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_floatingink.id.md) |  | `string` | Gets the ID of the FloatingInk object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`inkStrokes`](local.onenote_floatingink.inkstrokes.md) |  | `OneNote.InkStrokeCollection` | Gets the strokes of the FloatingInk object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`pageContent`](local.onenote_floatingink.pagecontent.md) |  | `OneNote.PageContent` | Gets the PageContent parent of the FloatingInk object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_floatingink.load.md) |  | `OneNote.FloatingInk` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

