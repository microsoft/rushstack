[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartDataLabels](local.excel_chartdatalabels.md)

# Excel\_ChartDataLabels class

Represents a collection of all the data labels on a chart point. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartdatalabels.format.md) |  | `Excel.ChartDataLabelFormat` | Represents the format of chart data labels, which includes fill and font formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`position`](local.excel_chartdatalabels.position.md) |  | `string` | DataLabelPosition value that represents the position of the data label. See Excel.ChartDataLabelPosition for details. <p/> \[Api set: ExcelApi 1.1\] |
|  [`separator`](local.excel_chartdatalabels.separator.md) |  | `string` | String representing the separator used for the data labels on a chart. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showBubbleSize`](local.excel_chartdatalabels.showbubblesize.md) |  | `boolean` | Boolean value representing if the data label bubble size is visible or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showCategoryName`](local.excel_chartdatalabels.showcategoryname.md) |  | `boolean` | Boolean value representing if the data label category name is visible or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showLegendKey`](local.excel_chartdatalabels.showlegendkey.md) |  | `boolean` | Boolean value representing if the data label legend key is visible or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showPercentage`](local.excel_chartdatalabels.showpercentage.md) |  | `boolean` | Boolean value representing if the data label percentage is visible or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showSeriesName`](local.excel_chartdatalabels.showseriesname.md) |  | `boolean` | Boolean value representing if the data label series name is visible or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showValue`](local.excel_chartdatalabels.showvalue.md) |  | `boolean` | Boolean value representing if the data label value is visible or not. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartdatalabels.load.md) |  | `Excel.ChartDataLabels` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartdatalabels.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartdatalabels.tojson.md) |  | `{
            "format": ChartDataLabelFormat;
            "position": string;
            "separator": string;
            "showBubbleSize": boolean;
            "showCategoryName": boolean;
            "showLegendKey": boolean;
            "showPercentage": boolean;
            "showSeriesName": boolean;
            "showValue": boolean;
        }` |  |

