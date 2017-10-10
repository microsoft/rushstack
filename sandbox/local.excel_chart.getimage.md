[Home](./index) &gt; [local](local.md) &gt; [Excel\_Chart](local.excel_chart.md) &gt; [getImage](local.excel_chart.getimage.md)

# Excel\_Chart.getImage method

Renders the chart as a base64-encoded image by scaling the chart to fit the specified dimensions. The aspect ratio is preserved as part of the resizing. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
getImage(width?: number, height?: number, fittingMode?: string): OfficeExtension.ClientResult<string>;
```
**Returns:** `OfficeExtension.ClientResult<string>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `width` | `number` |  |
|  `height` | `number` |  |
|  `fittingMode` | `string` |  |

