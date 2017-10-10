[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Application](local.onenote_application.md)

# OneNote\_Application class

Represents the top-level object that contains all globally addressable OneNote objects such as notebooks, the active notebook, and the active section. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`notebooks`](local.onenote_application.notebooks.md) |  | `OneNote.NotebookCollection` | Gets the collection of notebooks that are open in the OneNote application instance. In OneNote Online, only one notebook at a time is open in the application instance. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getActiveNotebook()`](local.onenote_application.getactivenotebook.md) |  | `OneNote.Notebook` | Gets the active notebook if one exists. If no notebook is active, throws ItemNotFound. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActiveNotebookOrNull()`](local.onenote_application.getactivenotebookornull.md) |  | `OneNote.Notebook` | Gets the active notebook if one exists. If no notebook is active, returns null. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActiveOutline()`](local.onenote_application.getactiveoutline.md) |  | `OneNote.Outline` | Gets the active outline if one exists, If no outline is active, throws ItemNotFound. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActiveOutlineOrNull()`](local.onenote_application.getactiveoutlineornull.md) |  | `OneNote.Outline` | Gets the active outline if one exists, otherwise returns null. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActivePage()`](local.onenote_application.getactivepage.md) |  | `OneNote.Page` | Gets the active page if one exists. If no page is active, throws ItemNotFound. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActivePageOrNull()`](local.onenote_application.getactivepageornull.md) |  | `OneNote.Page` | Gets the active page if one exists. If no page is active, returns null. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActiveSection()`](local.onenote_application.getactivesection.md) |  | `OneNote.Section` | Gets the active section if one exists. If no section is active, throws ItemNotFound. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getActiveSectionOrNull()`](local.onenote_application.getactivesectionornull.md) |  | `OneNote.Section` | Gets the active section if one exists. If no section is active, returns null. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`load(option)`](local.onenote_application.load.md) |  | `OneNote.Application` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`navigateToPage(page)`](local.onenote_application.navigatetopage.md) |  | `void` | Opens the specified page in the application instance. |
|  [`navigateToPageWithClientUrl(url)`](local.onenote_application.navigatetopagewithclienturl.md) |  | `OneNote.Page` | Gets the specified page, and opens it in the application instance. |

