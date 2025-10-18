import { SKRSContext2D } from '@napi-rs/canvas';
import { TableObjectData, TableObject } from '@gunwoochoi0/flyingshelf-types';

/**
 * Wrap text into lines that fit within max width
 */
function wrapTableText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  
  // First split by explicit line breaks
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  
  return lines.length > 0 ? lines : [''];
}

/**
 * Render table object on canvas context using pure canvas drawing
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

  const { columns, rows, styleConfig, textSize = 'small' } = table;

  if (!columns || !rows || columns.length === 0 || rows.length === 0) {
    console.warn('Table has no data');
    return;
  }

  try {
    ctx.save();
    ctx.globalAlpha = opacity;

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

    // Text size multipliers (matching browser behavior)
    const textSizeMultipliers: Record<string, number> = {
      small: 1.0,
      medium: 1.25,
      large: 1.5,
      largest: 2.0,
    };

    // Calculate font scale based on height
    const totalRows = rows.length;
    const baseFontSize = 16;
    const basePadding = 8;
    const borderWidth = defaultStyle.borders.borderWidth || 1;
    
    // Calculate how much vertical space we have per row
    const totalBorderHeight = borderWidth * (totalRows + 1);
    const availableHeight = height - totalBorderHeight;
    const rowHeight = availableHeight / totalRows;
    
    // Scale font size to fit row height
    const textSizeMultiplier = textSizeMultipliers[textSize] || 1.0;
    const maxFontSize = (rowHeight - basePadding * 2) * 0.6; // 60% of available height for text
    const fontSize = Math.min(baseFontSize * textSizeMultiplier, maxFontSize, baseFontSize * 2);
    const padding = Math.max(basePadding * (fontSize / baseFontSize), 4);

    // Calculate column widths in pixels
    const columnWidths = columns.map((col) => {
      const w = col.width;
      if (typeof w === 'string' && w.endsWith('%')) {
        return (parseFloat(w) / 100) * width;
      } else if (typeof w === 'string') {
        const parsed = parseInt(w);
        return isNaN(parsed) ? width / columns.length : parsed;
      }
      return width / columns.length;
    });

    // Normalize column widths to fit exact width
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    const normalizedWidths = columnWidths.map((w) => (w / totalWidth) * width);

    // Draw table background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    let currentY = 0;

    // Render each row
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

      const rowFontWeight = isHeader ? 'bold' : 'normal';

      // Draw row background
      ctx.fillStyle = rowBackgroundColor;
      ctx.fillRect(0, currentY, width, rowHeight);

      let currentX = 0;

      // Draw cells in this row
      row.cells.forEach((cell, cellIndex) => {
        if (cell.isMerged) {
          return; // Skip merged cells for now
        }

        const column = columns[cellIndex];
        const columnAlign = cell.style?.textAlign || column?.align || 'left';
        const cellWidth = normalizedWidths[cellIndex] * (cell.colspan || 1);
        
        // Draw cell background if specified
        if (cell.style?.backgroundColor && cell.style.backgroundColor !== 'transparent') {
          ctx.fillStyle = cell.style.backgroundColor;
          ctx.fillRect(currentX, currentY, cellWidth, rowHeight);
        }

        // Draw borders
        ctx.strokeStyle = defaultStyle.borders.borderColor;
        ctx.lineWidth = borderWidth;

        if (defaultStyle.borders.horizontal) {
          // Top border
          ctx.beginPath();
          ctx.moveTo(currentX, currentY);
          ctx.lineTo(currentX + cellWidth, currentY);
          ctx.stroke();

          // Bottom border (only for last row)
          if (rowIndex === rows.length - 1) {
            ctx.beginPath();
            ctx.moveTo(currentX, currentY + rowHeight);
            ctx.lineTo(currentX + cellWidth, currentY + rowHeight);
            ctx.stroke();
          }
        }

        if (defaultStyle.borders.vertical) {
          // Left border
          ctx.beginPath();
          ctx.moveTo(currentX, currentY);
          ctx.lineTo(currentX, currentY + rowHeight);
          ctx.stroke();

          // Right border (only for last column)
          if (cellIndex === columns.length - 1) {
            ctx.beginPath();
            ctx.moveTo(currentX + cellWidth, currentY);
            ctx.lineTo(currentX + cellWidth, currentY + rowHeight);
            ctx.stroke();
          }
        }

        // Draw cell text
        const cellValue = (cell.value || '').toString();
        const cellColor = cell.style?.fontColor || rowColor;
        const cellFontWeight = cell.style?.fontWeight || rowFontWeight;
        
        ctx.fillStyle = cellColor;
        ctx.font = `${cellFontWeight} ${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';

        // Wrap text to fit cell width
        const textMaxWidth = cellWidth - padding * 2;
        const lines = wrapTableText(ctx, cellValue, textMaxWidth);

        // Calculate text position based on alignment
        const lineHeight = fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        let textY = currentY + (rowHeight - totalTextHeight) / 2 + lineHeight / 2;

        lines.forEach((line) => {
          let textX = currentX + padding;

          if (columnAlign === 'center') {
            const lineWidth = ctx.measureText(line).width;
            textX = currentX + (cellWidth - lineWidth) / 2;
          } else if (columnAlign === 'right') {
            const lineWidth = ctx.measureText(line).width;
            textX = currentX + cellWidth - padding - lineWidth;
          }

          ctx.fillText(line, textX, textY);
          textY += lineHeight;
        });

        currentX += cellWidth;
      });

      currentY += rowHeight;
    });

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

