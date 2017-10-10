[Home](./index) &gt; [local](local.md) &gt; [Excel\_Chart](local.excel_chart.md)

# Excel\_Chart class

Represents a chart object in a workbook. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`axes`](local.excel_chart.axes.md) |  | `Excel.ChartAxes` | Represents chart axes. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`dataLabels`](local.excel_chart.datalabels.md) |  | `Excel.ChartDataLabels` | Represents the datalabels on the chart. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`format`](local.excel_chart.format.md) |  | `Excel.ChartAreaFormat` | Encapsulates the format properties for the chart area. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`height`](local.excel_chart.height.md) |  | `number` | Represents the height, in points, of the chart object. <p/> \[Api set: ExcelApi 1.1\] |
|  [`left`](local.excel_chart.left.md) |  | `number` | The distance, in points, from the left side of the chart to the worksheet origin. <p/> \[Api set: ExcelApi 1.1\] |
|  [`legend`](local.excel_chart.legend.md) |  | `Excel.ChartLegend` | Represents the legend for the chart. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_chart.name.md) |  | `string` | Represents the name of a chart object. <p/> \[Api set: ExcelApi 1.1\] |
|  [`series`](local.excel_chart.series.md) |  | `Excel.ChartSeriesCollection` | Represents either a single series or collection of series in the chart. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`title`](local.excel_chart.title.md) |  | `Excel.ChartTitle` | Represents the title of the specified chart, including the text, visibility, position and formating of the title. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`top`](local.excel_chart.top.md) |  | `number` | Represents the distance, in points, from the top edge of the object to the top of row 1 (on a worksheet) or the top of the chart area (on a chart). <p/> \[Api set: ExcelApi 1.1\] |
|  [`width`](local.excel_chart.width.md) |  | `number` | Represents the width, in points, of the chart object. <p/> \[Api set: ExcelApi 1.1\] |
|  [`worksheet`](local.excel_chart.worksheet.md) |  | `Excel.Worksheet` | The worksheet containing the current chart. Read-only. <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_chart.delete.md) |  | `void` | Deletes the chart object. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getImage(width, height, fittingMode)`](local.excel_chart.getimage.md) |  | `OfficeExtension.ClientResult<string>` | Renders the chart as a base64-encoded image by scaling the chart to fit the specified dimensions. The aspect ratio is preserved as part of the resizing. <p/> \[Api set: ExcelApi 1.2\] |
|  [`load(option)`](local.excel_chart.load.md) |  | `Excel.Chart` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chart.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`setData(sourceData, seriesBy)`](local.excel_chart.setdata.md) |  | `void` | Resets the source data for the chart. <p/> \[Api set: ExcelApi 1.1\] |
|  [`setPosition(startCell, endCell)`](local.excel_chart.setposition.md) |  | `void` | Positions the chart relative to cells on the worksheet. <p/> \[Api set: ExcelApi 1.1\] |
|  [`toJSON()`](local.excel_chart.tojson.md) |  | `{
            "axes": ChartAxes;
            "dataLabels": ChartDataLabels;
            "format": ChartAreaFormat;
            "height": number;
            "left": number;
            "legend": ChartLegend;
            "name": string;
            "title": ChartTitle;
            "top": number;
            "width": number;
        }` |  |

