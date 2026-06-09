import { jsPDF } from 'jspdf';
import { DAYS, SLOTS } from '../constants/timetable';
import { formatSemesterLabel, formatSemesterMode } from '../constants/semesterMode';

const SLOT_TIMES = {
  1: '8:40–9:30',
  2: '9:30–10:20',
  3: '10:20–11:10',
  4: '11:40–12:30',
  5: '12:30–1:20',
  6: '1:20–2:10',
  7: '2:10–3:00',
  8: '3:00–3:50',
};

/**
 * Draws a single premium entry card within a timetable cell
 */
function drawEntryCard(doc, x, y, width, height, entry, isClash) {
  let accentColor = [59, 130, 246]; // blue-500 (Lecture)
  let cardBg = [240, 249, 255]; // sky-50
  let cardBorder = [186, 230, 253]; // sky-200
  let textPrimary = [30, 41, 59]; // slate-800
  let textSecondary = [71, 85, 105]; // slate-600

  // 1. Determine colors based on type or clash state
  if (isClash) {
    accentColor = [239, 68, 68]; // rose-500
    cardBg = [254, 242, 242]; // rose-50
    cardBorder = [254, 202, 202]; // rose-200
    textPrimary = [136, 19, 55]; // rose-900
    textSecondary = [185, 28, 28]; // rose-700
  } else {
    const type = (entry.type || 'Lecture').toLowerCase();
    if (type === 'lab') {
      accentColor = [16, 185, 129]; // emerald-500
      cardBg = [240, 253, 244]; // emerald-50
      cardBorder = [187, 247, 208]; // emerald-200
    } else if (type === 'elective') {
      accentColor = [139, 92, 246]; // purple-500
      cardBg = [250, 245, 255]; // purple-50
      cardBorder = [233, 213, 255]; // purple-200
    }
  }

  // 2. Draw Card Container
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...cardBorder);
  doc.setLineWidth(0.18);
  doc.roundedRect(x, y, width, height, 1, 1, 'FD'); // 1mm radius rounded corners

  // 3. Draw Accent Line on the left
  doc.setFillColor(...accentColor);
  doc.rect(x, y, 1.2, height, 'F');

  // 4. Layout Text
  const isMini = height < 12;
  const leftPad = 2.5; // padding to clear left accent bar
  const topPad = isMini ? 2.5 : 3.5;
  const textX = x + leftPad;
  const textW = width - leftPad - 1.5;

  // Draw Subject
  doc.setFont('helvetica', 'bold');
  const subjFontSize = isMini ? 6 : 7.2;
  doc.setFontSize(subjFontSize);
  doc.setTextColor(...textPrimary);

  const subjectText = entry.subject || entry.label || '';
  const subjLines = doc.splitTextToSize(subjectText, textW);
  
  let linesToDraw = subjLines;
  if (isMini && linesToDraw.length > 1) {
    // Truncate for mini card
    linesToDraw = [linesToDraw[0].substring(0, 16) + '...'];
  } else if (!isMini && linesToDraw.length > 2) {
    // Limit to 2 lines for regular card
    linesToDraw = [linesToDraw[0], linesToDraw[1].substring(0, 14) + '...'];
  }

  let currentY = y + topPad;
  doc.text(linesToDraw, textX, currentY);

  const lineH = isMini ? 2.2 : 2.7;
  currentY += linesToDraw.length * lineH;

  // Draw Details (Type · Room)
  doc.setFont('helvetica', 'normal');
  const detailsFontSize = isMini ? 5 : 6;
  doc.setFontSize(detailsFontSize);
  doc.setTextColor(...textSecondary);

  const rawType = entry.type || 'Lecture';
  const typeStr = rawType.charAt(0).toUpperCase() + rawType.slice(1);
  const roomStr = entry.room ? `Rm ${entry.room}` : 'No Rm';
  const detailsText = `${typeStr} · ${roomStr}`;

  if (currentY + 1.8 < y + height) {
    doc.text(detailsText, textX, currentY);
    currentY += isMini ? 1.8 : 2.4;
  }

  // Draw Target (Prog · Sem X · Sec Y Batch)
  const progStr = entry.program ? entry.program : '';
  const semStr = entry.semester ? `Sem ${entry.semester}` : '';
  const secStr = entry.section ? `Sec ${entry.section}` : '';
  const batchStr = entry.batch ? `${entry.batch}` : '';
  const targetParts = [progStr, semStr, secStr, batchStr].filter(Boolean);
  const targetText = targetParts.join(' · ');

  if (currentY + 1.8 < y + height && targetText) {
    doc.text(targetText, textX, currentY);
  }
}

/**
 * Draws a list-based fallback for cells containing 3 or more entries
 */
function drawMultiListCard(doc, x, y, width, height, items, isClash) {
  const cardBg = isClash ? [254, 242, 242] : [248, 250, 252];
  const cardBorder = isClash ? [254, 202, 202] : [226, 232, 240];
  const accentColor = isClash ? [239, 68, 68] : [71, 85, 105];

  doc.setFillColor(...cardBg);
  doc.setDrawColor(...cardBorder);
  doc.setLineWidth(0.18);
  doc.roundedRect(x, y, width, height, 1, 1, 'FD');

  doc.setFillColor(...accentColor);
  doc.rect(x, y, 1.2, height, 'F');

  const textX = x + 2.5;
  let currentY = y + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Multiple Classes (${items.length})`, textX, currentY);
  currentY += 2.6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(71, 85, 105);

  items.slice(0, 4).forEach((item, index) => {
    if (currentY + 2.2 < y + height) {
      const typeChar = (item.type || 'L').charAt(0).toUpperCase();
      const progStr = item.program ? `${item.program} ` : '';
      const semSec = `${progStr}S${item.semester}${item.section || ''}`;
      const batchStr = item.batch ? `-${item.batch}` : '';
      const text = `${index + 1}. ${item.subject || item.label} (${typeChar} · ${semSec}${batchStr})`;
      const truncatedText = doc.splitTextToSize(text, width - 4.5)[0];
      doc.text(truncatedText, textX, currentY);
      currentY += 2.2;
    }
  });

  if (items.length > 4 && currentY + 2 < y + height) {
    doc.text(`... and ${items.length - 4} more`, textX, currentY);
  }
}

export function exportFacultyTimetablePdf(facultyName, grouped, clashes = [], options = {}) {
  // A4 dimensions: 297mm x 210mm
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  
  // Margins & Dimensions
  const startX = 12;
  const startY = 38;
  const dayColW = 22;
  
  const gridSlots = SLOTS.filter((s) => !s.isBreak);
  const numSlots = gridSlots.length;
  
  // Available grid width = 297 - 24 (margins) - 22 (day col) = 251mm
  // 251 / 8 slots = 31.375mm per slot col
  const slotColW = (pageW - startX * 2 - dayColW) / numSlots;
  const headerH = 12;
  const rowH = 23;

  // 1. Accent brand line at top
  doc.setFillColor(37, 99, 235); // Primary Blue (600)
  doc.rect(startX, 10, pageW - startX * 2, 1.2, 'F');

  // 2. Title & Header Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(`FACULTY WEEKLY SCHEDULE`, startX, 18);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Faculty: ${facultyName}`, startX, 24);

  // Render Metadata Subtitle on the left
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  const programSemesterMode = [
    options.semesterMode ? formatSemesterMode(options.semesterMode) : '',
    options.program ? `Program: ${options.program}` : '',
    options.semester ? `Semester: ${formatSemesterLabel(options.semester)}` : '',
  ].filter(Boolean).join('  |  ');
  doc.text(programSemesterMode || 'Timetable Management System', startX, 29);

  // Status Badge Pill (Top Right)
  const hasClashes = clashes.length > 0;
  const badgeW = 42;
  const badgeH = 7;
  const badgeX = pageW - startX - badgeW;
  const badgeY = 14;

  if (hasClashes) {
    // Red badge
    doc.setFillColor(254, 226, 226); // red-100
    doc.setDrawColor(252, 165, 165); // red-300
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(185, 28, 28); // red-700
    doc.text(`⚠ CLASHES DETECTED (${clashes.length})`, badgeX + badgeW / 2, badgeY + 4.8, { align: 'center' });
  } else {
    // Green badge
    doc.setFillColor(220, 252, 231); // green-100
    doc.setDrawColor(187, 247, 208); // green-200
    doc.setLineWidth(0.2);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(21, 128, 61); // green-700
    doc.text(`✔ SCHEDULE CLEAR`, badgeX + badgeW / 2, badgeY + 4.8, { align: 'center' });
  }

  // 3. Draw Grid Table
  doc.setDrawColor(226, 232, 240); // slate-200 border
  doc.setLineWidth(0.2);

  // Draw Header Cells
  // Day / Slot Header Cell
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(startX, startY, dayColW, headerH, 'F');
  doc.rect(startX, startY, dayColW, headerH, 'D');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Day / Slot', startX + dayColW / 2, startY + 7, { align: 'center' });

  // Slot Column Headers
  gridSlots.forEach((slot, i) => {
    const x = startX + dayColW + i * slotColW;
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(x, startY, slotColW, headerH, 'F');
    doc.rect(x, startY, slotColW, headerH, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Slot ${slot.id}`, x + slotColW / 2, startY + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(SLOT_TIMES[slot.id] || '', x + slotColW / 2, startY + 9.5, { align: 'center' });
  });

  // Helper check for clashing cells
  const isClashCell = (day, slotId) =>
    clashes.some((c) => c.day === day && c.slot === slotId);

  // Draw Data Rows
  DAYS.forEach((day, dayIdx) => {
    const rowY = startY + headerH + dayIdx * rowH;

    // Day Label Cell
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(startX, rowY, dayColW, rowH, 'F');
    doc.rect(startX, rowY, dayColW, rowH, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(day, startX + dayColW / 2, rowY + rowH / 2 + 1, { align: 'center' });

    // Slot Cells
    gridSlots.forEach((slot, i) => {
      const x = startX + dayColW + i * slotColW;
      const items = grouped?.[day]?.[String(slot.id)] || [];
      const clash = isClashCell(day, slot.id);

      // Check special slots
      const isLunch = slot.id === 7 && day !== 'Saturday' && day !== 'Wednesday';
      const isTdpcl = slot.id === 7 && day === 'Wednesday';
      const isClosed = day === 'Saturday' && (slot.id === 7 || slot.id === 8);

      if (isTdpcl) {
        // Wednesday Slot 7: TDPCL
        doc.setFillColor(255, 251, 235); // amber-50
        doc.rect(x, rowY, slotColW, rowH, 'F');
        doc.rect(x, rowY, slotColW, rowH, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9); // amber-700
        doc.text('TDPCL', x + slotColW / 2, rowY + rowH / 2 + 1, { align: 'center' });
      } else if (isLunch) {
        // Mon/Tue/Thu/Fri Slot 7: Lunch
        doc.setFillColor(255, 251, 235); // amber-50
        doc.rect(x, rowY, slotColW, rowH, 'F');
        doc.rect(x, rowY, slotColW, rowH, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9); // amber-700
        doc.text('LUNCH', x + slotColW / 2, rowY + rowH / 2 + 1, { align: 'center' });
      } else if (isClosed) {
        // Saturday Slot 7 & 8: Closed
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(x, rowY, slotColW, rowH, 'F');
        doc.rect(x, rowY, slotColW, rowH, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text('CLOSED', x + slotColW / 2, rowY + rowH / 2 + 1, { align: 'center' });
      } else if (items.length === 0) {
        // Free Slot
        doc.setFillColor(255, 255, 255); // white
        doc.rect(x, rowY, slotColW, rowH, 'F');
        doc.rect(x, rowY, slotColW, rowH, 'D');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(203, 213, 225); // slate-300
        doc.text('FREE', x + slotColW / 2, rowY + rowH / 2 + 1, { align: 'center' });
      } else {
        // Draw normal grid cell background & border
        doc.setFillColor(255, 255, 255);
        doc.rect(x, rowY, slotColW, rowH, 'F');
        doc.rect(x, rowY, slotColW, rowH, 'D');

        // Draw card content inside cell with padding
        const pad = 1.0;
        const cardW = slotColW - 2 * pad;
        const cardH = rowH - 2 * pad;

        if (items.length === 1) {
          // Single scheduled entry: full card
          drawEntryCard(doc, x + pad, rowY + pad, cardW, cardH, items[0], clash);
        } else if (items.length === 2) {
          // Double entry (clash or multi-batch lab/elective): split card layout
          const gap = 0.8;
          const splitH = (cardH - gap) / 2;
          const cardY1 = rowY + pad;
          const cardY2 = rowY + pad + splitH + gap;

          drawEntryCard(doc, x + pad, cardY1, cardW, splitH, items[0], clash);
          drawEntryCard(doc, x + pad, cardY2, cardW, splitH, items[1], clash);
        } else {
          // Triple+ entry: bullet list inside a card
          drawMultiListCard(doc, x + pad, rowY + pad, cardW, cardH, items, clash);
        }
      }
    });
  });

  // 4. Draw Legend (at the bottom)
  const legendItems = [
    { type: 'lecture', label: 'Lecture' },
    { type: 'lab', label: 'Lab Class' },
    { type: 'elective', label: 'Elective' },
    { type: 'clash', label: 'Clash / Warn' },
    { type: 'lunch', label: 'Lunch Break' },
    { type: 'tdpcl', label: 'TDPCL' },
    { type: 'closed', label: 'Closed' }
  ];

  let legX = startX;
  const legY = 193;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('Legend:', legX, legY + 2.5);
  legX += 12;

  legendItems.forEach((item) => {
    const swatchW = 4.5;
    const swatchH = 2.8;
    const swatchY = legY + 0.3;

    if (['lecture', 'lab', 'elective', 'clash'].includes(item.type)) {
      let accent = [59, 130, 246];
      let bg = [240, 249, 255];
      let border = [186, 230, 253];

      if (item.type === 'lab') {
        accent = [16, 185, 129];
        bg = [240, 253, 244];
        border = [187, 247, 208];
      } else if (item.type === 'elective') {
        accent = [139, 92, 246];
        bg = [250, 245, 255];
        border = [233, 213, 255];
      } else if (item.type === 'clash') {
        accent = [239, 68, 68];
        bg = [254, 242, 242];
        border = [254, 202, 202];
      }

      doc.setFillColor(...bg);
      doc.setDrawColor(...border);
      doc.setLineWidth(0.15);
      doc.roundedRect(legX, swatchY, swatchW, swatchH, 0.4, 0.4, 'FD');

      doc.setFillColor(...accent);
      doc.rect(legX, swatchY, 0.7, swatchH, 'F');
    } else if (['lunch', 'tdpcl'].includes(item.type)) {
      doc.setFillColor(255, 251, 235); // amber-50
      doc.setDrawColor(253, 230, 138); // amber-200
      doc.setLineWidth(0.15);
      doc.roundedRect(legX, swatchY, swatchW, swatchH, 0.4, 0.4, 'FD');
    } else if (item.type === 'closed') {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.15);
      doc.roundedRect(legX, swatchY, swatchW, swatchH, 0.4, 0.4, 'FD');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(item.label, legX + swatchW + 1.2, legY + 2.4);

    const labelWidth = doc.getTextWidth(item.label);
    legX += swatchW + 1.2 + labelWidth + 7; // spacing
  });

  // 5. Draw Footer (at the bottom)
  doc.setDrawColor(241, 245, 249); // slate-100 line
  doc.setLineWidth(0.25);
  doc.line(startX, 199, pageW - startX, 199);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  
  const timestampStr = `Generated on ${new Date().toLocaleString()}`;
  doc.text(timestampStr, startX, 203.5);
  doc.text('Page 1 of 1', pageW - startX, 203.5, { align: 'right' });

  // 6. Save File
  const filename = `${facultyName.replace(/\s+/g, '_')}_timetable.pdf`;
  doc.save(filename);
}
