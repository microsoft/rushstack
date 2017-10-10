[Home](./index) &gt; [local](local.md) &gt; [Excel\_BindingCollection](local.excel_bindingcollection.md)

# Excel\_BindingCollection class

Represents the collection of all the binding objects that are part of the workbook. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_bindingcollection.count.md) |  | `number` | Returns the number of bindings in the collection. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_bindingcollection.items.md) |  | `Array<Excel.Binding>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(range, bindingType, id)`](local.excel_bindingcollection.add.md) |  | `Excel.Binding` | Add a new binding to a particular Range. <p/> \[Api set: ExcelApi 1.3\] |
|  [`addFromNamedItem(name, bindingType, id)`](local.excel_bindingcollection.addfromnameditem.md) |  | `Excel.Binding` | Add a new binding based on a named item in the workbook. <p/> \[Api set: ExcelApi 1.3\] |
|  [`addFromSelection(bindingType, id)`](local.excel_bindingcollection.addfromselection.md) |  | `Excel.Binding` | Add a new binding based on the current selection. <p/> \[Api set: ExcelApi 1.3\] |
|  [`getCount()`](local.excel_bindingcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of bindings in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(id)`](local.excel_bindingcollection.getitem.md) |  | `Excel.Binding` | Gets a binding object by ID. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemAt(index)`](local.excel_bindingcollection.getitemat.md) |  | `Excel.Binding` | Gets a binding object based on its position in the items array. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemOrNullObject(id)`](local.excel_bindingcollection.getitemornullobject.md) |  | `Excel.Binding` | Gets a binding object by ID. If the binding object does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_bindingcollection.load.md) |  | `Excel.BindingCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_bindingcollection.tojson.md) |  | `{
            "count": number;
        }` |  |

