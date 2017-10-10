[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeBorderCollection](local.excel_rangebordercollection.md)

# Excel\_RangeBorderCollection class

Represents the border objects that make up the range border. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_rangebordercollection.count.md) |  | `number` | Number of border objects in the collection. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_rangebordercollection.items.md) |  | `Array<Excel.RangeBorder>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.excel_rangebordercollection.getitem.md) |  | `Excel.RangeBorder` | Gets a border object using its name <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemAt(index)`](local.excel_rangebordercollection.getitemat.md) |  | `Excel.RangeBorder` | Gets a border object using its index <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_rangebordercollection.load.md) |  | `Excel.RangeBorderCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_rangebordercollection.tojson.md) |  | `{
            "count": number;
        }` |  |

