[Home](./index) &gt; [local](local.md) &gt; [Excel\_NamedItemCollection](local.excel_nameditemcollection.md)

# Excel\_NamedItemCollection class

A collection of all the nameditem objects that are part of the workbook or worksheet, depending on how it was reached. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_nameditemcollection.items.md) |  | `Array<Excel.NamedItem>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(name, reference, comment)`](local.excel_nameditemcollection.add.md) |  | `Excel.NamedItem` | Adds a new name to the collection of the given scope. <p/> \[Api set: ExcelApi 1.4\] |
|  [`addFormulaLocal(name, formula, comment)`](local.excel_nameditemcollection.addformulalocal.md) |  | `Excel.NamedItem` | Adds a new name to the collection of the given scope using the user's locale for the formula. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getCount()`](local.excel_nameditemcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of named items in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(name)`](local.excel_nameditemcollection.getitem.md) |  | `Excel.NamedItem` | Gets a nameditem object using its name <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemOrNullObject(name)`](local.excel_nameditemcollection.getitemornullobject.md) |  | `Excel.NamedItem` | Gets a nameditem object using its name. If the nameditem object does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_nameditemcollection.load.md) |  | `Excel.NamedItemCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_nameditemcollection.tojson.md) |  | `{}` |  |

