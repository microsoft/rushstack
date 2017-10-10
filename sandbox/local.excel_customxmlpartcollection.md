[Home](./index) &gt; [local](local.md) &gt; [Excel\_CustomXmlPartCollection](local.excel_customxmlpartcollection.md)

# Excel\_CustomXmlPartCollection class

A collection of custom XML parts. 

 \[Api set: ExcelApi 1.5\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_customxmlpartcollection.items.md) |  | `Array<Excel.CustomXmlPart>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(xml)`](local.excel_customxmlpartcollection.add.md) |  | `Excel.CustomXmlPart` | Adds a new custom XML part to the workbook. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getByNamespace(namespaceUri)`](local.excel_customxmlpartcollection.getbynamespace.md) |  | `Excel.CustomXmlPartScopedCollection` | Gets a new scoped collection of custom XML parts whose namespaces match the given namespace. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getCount()`](local.excel_customxmlpartcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of CustomXml parts in the collection. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getItem(id)`](local.excel_customxmlpartcollection.getitem.md) |  | `Excel.CustomXmlPart` | Gets a custom XML part based on its ID. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getItemOrNullObject(id)`](local.excel_customxmlpartcollection.getitemornullobject.md) |  | `Excel.CustomXmlPart` | Gets a custom XML part based on its ID. If the CustomXmlPart does not exist, the return object's isNull property will be true. <p/> \[Api set: ExcelApi 1.5\] |
|  [`load(option)`](local.excel_customxmlpartcollection.load.md) |  | `Excel.CustomXmlPartCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_customxmlpartcollection.tojson.md) |  | `{}` |  |

