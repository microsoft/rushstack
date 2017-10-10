[Home](./index) &gt; [local](local.md) &gt; [Excel\_Binding](local.excel_binding.md)

# Excel\_Binding class

Represents an Office.js binding that is defined in the workbook. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.excel_binding.id.md) |  | `string` | Represents binding identifier. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`onDataChanged`](local.excel_binding.ondatachanged.md) |  | `OfficeExtension.EventHandlers<Excel.BindingDataChangedEventArgs>` | Occurs when data or formatting within the binding is changed. <p/> \[Api set: ExcelApi 1.2\] |
|  [`onSelectionChanged`](local.excel_binding.onselectionchanged.md) |  | `OfficeExtension.EventHandlers<Excel.BindingSelectionChangedEventArgs>` | Occurs when the selection is changed within the binding. <p/> \[Api set: ExcelApi 1.2\] |
|  [`type`](local.excel_binding.type.md) |  | `string` | Returns the type of the binding. See Excel.BindingType for details. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_binding.delete.md) |  | `void` | Deletes the binding. <p/> \[Api set: ExcelApi 1.3\] |
|  [`getRange()`](local.excel_binding.getrange.md) |  | `Excel.Range` | Returns the range represented by the binding. Will throw an error if binding is not of the correct type. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getTable()`](local.excel_binding.gettable.md) |  | `Excel.Table` | Returns the table represented by the binding. Will throw an error if binding is not of the correct type. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getText()`](local.excel_binding.gettext.md) |  | `OfficeExtension.ClientResult<string>` | Returns the text represented by the binding. Will throw an error if binding is not of the correct type. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_binding.load.md) |  | `Excel.Binding` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_binding.tojson.md) |  | `{
            "id": string;
            "type": string;
        }` |  |

