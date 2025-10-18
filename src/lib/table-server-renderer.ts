import { SKRSContext2D, loadImage } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { TableObjectData, TableObject } from '@gunwoochoi0/flyingshelf-types';

/**
 * Generate HTML for a table
 */
function renderTableHTML(table: TableObject, width: number, height: number): string {
  const { columns, rows, styleConfig } = table;

  // Default style config
  const defaultStyle = styleConfig || {
    header: {
      backgroundColor: '#E0F7FA',
      fontColor: '#006064',
      fontWeight: 'bold',
    },
    rows: {
      alternatingColors: true,
      oddRowBackgroundColor: '#FFFFFF',
      evenRowBackgroundColor: '#F5F5F5',
      defaultFontColor: '#000000',
    },
    borders: {
      horizontal: true,
      vertical: true,
      borderColor: '#E0E0E0',
      borderWidth: 1,
    },
  };

  // Calculate column widths
  const columnWidths = columns.map((col) => {
    const w = col.width;
    if (typeof w === 'string' && w.endsWith('%')) {
      return w;
    } else if (typeof w === 'string') {
      const parsed = parseInt(w);
      return `${(parsed / width) * 100}%`;
    }
    return `${100 / columns.length}%`;
  });

  let html = `
    <table style="
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      font-family: Arial, sans-serif;
      table-layout: fixed;
    ">
      <colgroup>
        ${columns
          .map(
            (col, i) => `
          <col style="width: ${columnWidths[i]};" />
        `
          )
          .join('')}
      </colgroup>
      <tbody>
  `;

  rows.forEach((row, rowIndex) => {
    const isHeader = row.type === 'header' || row.type === 'sectionHeader';
    const isEvenDataRow = row.type === 'data' && rowIndex % 2 === 0;

    const rowBackgroundColor = isHeader
      ? defaultStyle.header.backgroundColor
      : defaultStyle.rows.alternatingColors && isEvenDataRow
        ? defaultStyle.rows.evenRowBackgroundColor
        : defaultStyle.rows.oddRowBackgroundColor;

    const rowColor = isHeader
      ? defaultStyle.header.fontColor
      : defaultStyle.rows.defaultFontColor;

    html += `
      <tr style="
        background-color: ${rowBackgroundColor};
        color: ${rowColor};
      ">
    `;

    row.cells.forEach((cell, cellIndex) => {
      if (cell.isMerged) {
        return; // Skip merged cells
      }

      const CellTag = isHeader ? 'th' : 'td';
      const column = columns[cellIndex];
      const columnAlign = column?.align || 'left';

      const borderStyle = `
        ${defaultStyle.borders.horizontal ? `border-top: ${defaultStyle.borders.borderWidth}px solid ${defaultStyle.borders.borderColor};` : ''}
        ${defaultStyle.borders.vertical ? `border-left: ${defaultStyle.borders.borderWidth}px solid ${defaultStyle.borders.borderColor};` : ''}
        ${cellIndex === columns.length - 1 && defaultStyle.borders.vertical ? `border-right: ${defaultStyle.borders.borderWidth}px solid ${defaultStyle.borders.borderColor};` : ''}
        ${rowIndex === rows.length - 1 && defaultStyle.borders.horizontal ? `border-bottom: ${defaultStyle.borders.borderWidth}px solid ${defaultStyle.borders.borderColor};` : ''}
      `;

      html += `
        <${CellTag}
          colspan="${cell.colspan || 1}"
          rowspan="${cell.rowspan || 1}"
          style="
            padding: 8px;
            font-size: 16px;
            text-align: ${cell.style?.textAlign || columnAlign};
            font-weight: ${isHeader ? defaultStyle.header.fontWeight : cell.style?.fontWeight || 'normal'};
            background-color: ${cell.style?.backgroundColor || 'transparent'};
            color: ${cell.style?.fontColor || 'inherit'};
            ${borderStyle}
            white-space: pre-wrap;
            word-break: break-word;
            vertical-align: middle;
          "
        >
          ${(cell.value || '').toString().replace(/\n/g, '<br />') || '&nbsp;'}
        </${CellTag}>
      `;
    });

    html += '</tr>';
  });

  html += `
      </tbody>
    </table>
  `;

  return html;
}

/**
 * Render table object on canvas context
 */
export async function renderTableServerSide(
  ctx: SKRSContext2D,
  obj: TableObjectData
): Promise<void> {
  const { table, width, height, opacity } = obj;

  if (!table) {
    console.warn('Table data missing');
    return;
  }

  try {
    // Generate HTML for the table
    const tableHTML = renderTableHTML(table, width, height);

    // Create SVG with foreignObject containing HTML table
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="${width}" height="${height}">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px; overflow: hidden; background: white;">
            ${tableHTML}
          </div>
        </foreignObject>
      </svg>
    `;

    // Use resvg-js for better SVG rendering (handles foreignObject and text)
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: true },
    });
    const pngBuffer = resvg.render().asPng();
    const img = await loadImage(pngBuffer);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(img as any, 0, 0, width, height);
    ctx.restore();
  } catch (error) {
    console.error('Failed to render table:', error);
    // Draw error placeholder
    ctx.fillStyle = '#ffebee';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#c62828';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Table Render Error', width / 2, height / 2);
  }
}

