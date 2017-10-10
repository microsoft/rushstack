[Home](./index) &gt; [local](local.md) &gt; [Excel\_CustomXmlPartScopedCollection](local.excel_customxmlpartscopedcollection.md)

# Excel\_CustomXmlPartScopedCollection class

A scoped collection of custom XML parts. A scoped collection is the result of some operation, e.g. filtering by namespace. A scoped collection cannot be scoped any further. 

 \[Api set: ExcelApi 1.5\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_customxmlpartscopedcollection.items.md) |  | `Array<Excel.CustomXmlPart>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getCount()`](local.excel_customxmlpartscopedcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of CustomXML parts in this collection. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getItem(id)`](local.excel_customxmlpartscopedcollection.getitem.md) |  | `Excel.CustomXmlPart` | Gets a custom XML part based on its ID. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getItemOrNullObject(id)`](local.excel_customxmlpartscopedcollection.getitemornullobject.md) |  | `Excel.CustomXmlPart` | Gets a custom XML part based on its ID. If the CustomXmlPart does not exist, the return object's isNull property will be true. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getOnlyItem()`](local.excel_customxmlpartscopedcollection.getonlyitem.md) |  | `Excel.CustomXmlPart` | If the collection contains exactly one item, this method returns it. Otherwise, this method produces an error. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getOnlyItemOrNullObject()`](local.excel_customxmlpartscopedcollection.getonlyitemornullobject.md) |  | `Excel.CustomXmlPart` | If the collection contains exactly one item, this method returns it. Otherwise, this method returns Null. <p/> \[Api set: ExcelApi 1.5\] |
|  [`load(option)`](local.excel_customxmlpartscopedcollection.load.md) |  | `Excel.CustomXmlPartScopedCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_customxmlpartscopedcollection.tojson.md) |  | `{}` |  |

