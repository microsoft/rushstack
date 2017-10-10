[Home](./index) &gt; [local](local.md) &gt; [Excel\_NamedItem](local.excel_nameditem.md)

# Excel\_NamedItem class

Represents a defined name for a range of cells or value. Names can be primitive named objects (as seen in the type below), range object, reference to a range. This object can be used to obtain range object associated with names. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`comment`](local.excel_nameditem.comment.md) |  | `string` | Represents the comment associated with this name. <p/> \[Api set: ExcelApi 1.4\] |
|  [`name`](local.excel_nameditem.name.md) |  | `string` | The name of the object. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`scope`](local.excel_nameditem.scope.md) |  | `string` | Indicates whether the name is scoped to the workbook or to a specific worksheet. Read-only. <p/> \[Api set: ExcelApi 1.4\] |
|  [`type`](local.excel_nameditem.type.md) |  | `string` | Indicates the type of the value returned by the name's formula. See Excel.NamedItemType for details. Read-only. <p/> \[Api set: ExcelApi 1.1 for String,Integer,Double,Boolean,Range,Error; 1.7 for Array\] |
|  [`value`](local.excel_nameditem.value.md) |  | `any` | Represents the value computed by the name's formula. For a named range, will return the range address. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`visible`](local.excel_nameditem.visible.md) |  | `boolean` | Specifies whether the object is visible or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`worksheet`](local.excel_nameditem.worksheet.md) |  | `Excel.Worksheet` | Returns the worksheet on which the named item is scoped to. Throws an error if the items is scoped to the workbook instead. <p/> \[Api set: ExcelApi 1.4\] |
|  [`worksheetOrNullObject`](local.excel_nameditem.worksheetornullobject.md) |  | `Excel.Worksheet` | Returns the worksheet on which the named item is scoped to. Returns a null object if the item is scoped to the workbook instead. <p/> \[Api set: ExcelApi 1.4\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_nameditem.delete.md) |  | `void` | Deletes the given name. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getRange()`](local.excel_nameditem.getrange.md) |  | `Excel.Range` | Returns the range object that is associated with the name. Throws an error if the named item's type is not a range. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getRangeOrNullObject()`](local.excel_nameditem.getrangeornullobject.md) |  | `Excel.Range` | Returns the range object that is associated with the name. Returns a null object if the named item's type is not a range. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_nameditem.load.md) |  | `Excel.NamedItem` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_nameditem.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_nameditem.tojson.md) |  | `{
            "comment": string;
            "name": string;
            "scope": string;
            "type": string;
            "value": any;
            "visible": boolean;
        }` |  |

