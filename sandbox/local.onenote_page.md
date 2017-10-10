[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Page](local.onenote_page.md)

# OneNote\_Page class

Represents a OneNote page. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`clientUrl`](local.onenote_page.clienturl.md) |  | `string` | The client url of the page. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`contents`](local.onenote_page.contents.md) |  | `OneNote.PageContentCollection` | The collection of PageContent objects on the page. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_page.id.md) |  | `string` | Gets the ID of the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`inkAnalysisOrNull`](local.onenote_page.inkanalysisornull.md) |  | `OneNote.InkAnalysis` | Text interpretation for the ink on the page. Returns null if there is no ink analysis information. Read only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`pageLevel`](local.onenote_page.pagelevel.md) |  | `number` | Gets or sets the indentation level of the page. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentSection`](local.onenote_page.parentsection.md) |  | `OneNote.Section` | Gets the section that contains the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`title`](local.onenote_page.title.md) |  | `string` | Gets or sets the title of the page. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`webUrl`](local.onenote_page.weburl.md) |  | `string` | The web url of the page. Read only <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addOutline(left, top, html)`](local.onenote_page.addoutline.md) |  | `OneNote.Outline` | Adds an Outline to the page at the specified position. |
|  [`copyToSection(destinationSection)`](local.onenote_page.copytosection.md) |  | `OneNote.Page` | Copies this page to specified section. |
|  [`insertPageAsSibling(location, title)`](local.onenote_page.insertpageassibling.md) |  | `OneNote.Page` | Inserts a new page before or after the current page. |
|  [`load(option)`](local.onenote_page.load.md) |  | `OneNote.Page` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

