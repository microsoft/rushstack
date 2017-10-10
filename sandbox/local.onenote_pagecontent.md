[Home](./index) &gt; [local](local.md) &gt; [OneNote\_PageContent](local.onenote_pagecontent.md)

# OneNote\_PageContent class

Represents a region on a page that contains top-level content types such as Outline or Image. A PageContent object can be assigned an XY position. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_pagecontent.id.md) |  | `string` | Gets the ID of the PageContent object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`image`](local.onenote_pagecontent.image.md) |  | `OneNote.Image` | Gets the Image in the PageContent object. Throws an exception if PageContentType is not Image. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`ink`](local.onenote_pagecontent.ink.md) |  | `OneNote.FloatingInk` | Gets the ink in the PageContent object. Throws an exception if PageContentType is not Ink. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`left`](local.onenote_pagecontent.left.md) |  | `number` | Gets or sets the left (X-axis) position of the PageContent object. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`outline`](local.onenote_pagecontent.outline.md) |  | `OneNote.Outline` | Gets the Outline in the PageContent object. Throws an exception if PageContentType is not Outline. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentPage`](local.onenote_pagecontent.parentpage.md) |  | `OneNote.Page` | Gets the page that contains the PageContent object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`top`](local.onenote_pagecontent.top.md) |  | `number` | Gets or sets the top (Y-axis) position of the PageContent object. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`type`](local.onenote_pagecontent.type.md) |  | `string` | Gets the type of the PageContent object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.onenote_pagecontent.delete.md) |  | `void` | Deletes the PageContent object. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`load(option)`](local.onenote_pagecontent.load.md) |  | `OneNote.PageContent` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

