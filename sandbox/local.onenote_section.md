[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Section](local.onenote_section.md)

# OneNote\_Section class

Represents a OneNote section. Sections can contain pages. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`clientUrl`](local.onenote_section.clienturl.md) |  | `string` | The client url of the section. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_section.id.md) |  | `string` | Gets the ID of the section. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`name`](local.onenote_section.name.md) |  | `string` | Gets the name of the section. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`notebook`](local.onenote_section.notebook.md) |  | `OneNote.Notebook` | Gets the notebook that contains the section. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`pages`](local.onenote_section.pages.md) |  | `OneNote.PageCollection` | The collection of pages in the section. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentSectionGroup`](local.onenote_section.parentsectiongroup.md) |  | `OneNote.SectionGroup` | Gets the section group that contains the section. Throws ItemNotFound if the section is a direct child of the notebook. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentSectionGroupOrNull`](local.onenote_section.parentsectiongroupornull.md) |  | `OneNote.SectionGroup` | Gets the section group that contains the section. Returns null if the section is a direct child of the notebook. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addPage(title)`](local.onenote_section.addpage.md) |  | `OneNote.Page` | Adds a new page to the end of the section. |
|  [`copyToNotebook(destinationNotebook)`](local.onenote_section.copytonotebook.md) |  | `OneNote.Section` | Copies this section to specified notebook. |
|  [`copyToSectionGroup(destinationSectionGroup)`](local.onenote_section.copytosectiongroup.md) |  | `OneNote.Section` | Copies this section to specified section group. |
|  [`insertSectionAsSibling(location, title)`](local.onenote_section.insertsectionassibling.md) |  | `OneNote.Section` | Inserts a new section before or after the current section. |
|  [`load(option)`](local.onenote_section.load.md) |  | `OneNote.Section` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

