[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalRangeBorderCollection](local.excel_conditionalrangebordercollection.md)

# Excel\_ConditionalRangeBorderCollection class

Represents the border objects that make up range border. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`bottom`](local.excel_conditionalrangebordercollection.bottom.md) |  | `Excel.ConditionalRangeBorder` | Gets the top border <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`count`](local.excel_conditionalrangebordercollection.count.md) |  | `number` | Number of border objects in the collection. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`items`](local.excel_conditionalrangebordercollection.items.md) |  | `Array<Excel.ConditionalRangeBorder>` | Gets the loaded child items in this collection. |
|  [`left`](local.excel_conditionalrangebordercollection.left.md) |  | `Excel.ConditionalRangeBorder` | Gets the top border <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`right`](local.excel_conditionalrangebordercollection.right.md) |  | `Excel.ConditionalRangeBorder` | Gets the top border <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`top`](local.excel_conditionalrangebordercollection.top.md) |  | `Excel.ConditionalRangeBorder` | Gets the top border <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.excel_conditionalrangebordercollection.getitem.md) |  | `Excel.ConditionalRangeBorder` | Gets a border object using its name <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`getItemAt(index)`](local.excel_conditionalrangebordercollection.getitemat.md) |  | `Excel.ConditionalRangeBorder` | Gets a border object using its index <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`load(option)`](local.excel_conditionalrangebordercollection.load.md) |  | `Excel.ConditionalRangeBorderCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_conditionalrangebordercollection.tojson.md) |  | `{
            "count": number;
        }` |  |

