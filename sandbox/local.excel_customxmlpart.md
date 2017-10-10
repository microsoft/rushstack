[Home](./index) &gt; [local](local.md) &gt; [Excel\_CustomXmlPart](local.excel_customxmlpart.md)

# Excel\_CustomXmlPart class

Represents a custom XML part object in a workbook. 

 \[Api set: ExcelApi 1.5\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.excel_customxmlpart.id.md) |  | `string` | The custom XML part's ID. Read-only. <p/> \[Api set: ExcelApi 1.5\] |
|  [`namespaceUri`](local.excel_customxmlpart.namespaceuri.md) |  | `string` | The custom XML part's namespace URI. Read-only. <p/> \[Api set: ExcelApi 1.5\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_customxmlpart.delete.md) |  | `void` | Deletes the custom XML part. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getXml()`](local.excel_customxmlpart.getxml.md) |  | `OfficeExtension.ClientResult<string>` | Gets the custom XML part's full XML content. <p/> \[Api set: ExcelApi 1.5\] |
|  [`load(option)`](local.excel_customxmlpart.load.md) |  | `Excel.CustomXmlPart` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`setXml(xml)`](local.excel_customxmlpart.setxml.md) |  | `void` | Sets the custom XML part's full XML content. <p/> \[Api set: ExcelApi 1.5\] |
|  [`toJSON()`](local.excel_customxmlpart.tojson.md) |  | `{
            "id": string;
            "namespaceUri": string;
        }` |  |

