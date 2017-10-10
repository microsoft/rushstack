[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Notebook](local.onenote_notebook.md)

# OneNote\_Notebook class

Represents a OneNote notebook. Notebooks contain section groups and sections. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`clientUrl`](local.onenote_notebook.clienturl.md) |  | `string` | The client url of the notebook. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_notebook.id.md) |  | `string` | Gets the ID of the notebook. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`name`](local.onenote_notebook.name.md) |  | `string` | Gets the name of the notebook. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`sectionGroups`](local.onenote_notebook.sectiongroups.md) |  | `OneNote.SectionGroupCollection` | The section groups in the notebook. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`sections`](local.onenote_notebook.sections.md) |  | `OneNote.SectionCollection` | The the sections of the notebook. Read only <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addSection(name)`](local.onenote_notebook.addsection.md) |  | `OneNote.Section` | Adds a new section to the end of the notebook. |
|  [`addSectionGroup(name)`](local.onenote_notebook.addsectiongroup.md) |  | `OneNote.SectionGroup` | Adds a new section group to the end of the notebook. |
|  [`load(option)`](local.onenote_notebook.load.md) |  | `OneNote.Notebook` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

