[Home](./index) &gt; [local](local.md) &gt; [Excel\_Application](local.excel_application.md)

# Excel\_Application class

Represents the Excel application that manages the workbook. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`calculationMode`](local.excel_application.calculationmode.md) |  | `string` | Returns the calculation mode used in the workbook. See Excel.CalculationMode for details. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`calculate(calculationType)`](local.excel_application.calculate.md) |  | `void` | Recalculate all currently opened workbooks in Excel. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_application.load.md) |  | `Excel.Application` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`suspendApiCalculationUntilNextSync()`](local.excel_application.suspendapicalculationuntilnextsync.md) |  | `void` | Suspends calculation until the next "context.sync()" is called. Once set, it is the developer's responsibility to re-calc the workbook, to ensure that any dependencies are propagated. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`toJSON()`](local.excel_application.tojson.md) |  | `{
            "calculationMode": string;
        }` |  |

