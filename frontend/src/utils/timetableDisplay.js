/** Client-side grouping (mirrors backend) for timetable cells */

export const inferEntryType = (entry) => {
  if (entry.type) return entry.type;
  if (entry.subject === 'BUFFER SLOT') return 'buffer';
  if (entry.subject === 'TDPCL' || entry.isSpecial) return 'special';
  if (entry.isElective || entry.is_elective) return 'elective';
  if (entry.batch) return 'lab';
  return 'lecture';
};

export const formatElectiveLabel = (subjects) =>
  subjects.map((s) => `${s.name} (${s.room})`).join(' / ');

export const groupCellDisplayItems = (flatEntries, day, slotId) => {
  const slotEntries = flatEntries.filter((e) => e.day === day && e.slot === slotId);
  if (slotEntries.length === 0) return [];

  const electiveGroups = new Map();
  const others = [];

  slotEntries.forEach((entry) => {
    const type = inferEntryType(entry);
    if (type === 'elective') {
      const key = `${entry.section}|${entry.elective_group || entry.electiveGroup || ''}`;
      if (!electiveGroups.has(key)) {
        electiveGroups.set(key, {
          type: 'elective',
          day: entry.day,
          slot: entry.slot,
          section: entry.section,
          program: entry.program,
          semester: entry.semester,
          elective_group: entry.elective_group || entry.electiveGroup,
          subjects: [],
          seen: new Set(),
        });
      }
      const g = electiveGroups.get(key);
      const sk = `${entry.subject}|${entry.room}`;
      if (!g.seen.has(sk)) {
        g.seen.add(sk);
        g.subjects.push({
          name: entry.subject,
          room: entry.room,
          faculty: entry.faculty,
        });
      }
    } else {
      others.push(entry);
    }
  });

  const items = [];

  electiveGroups.forEach((g) => {
    const { seen, ...rest } = g;
    items.push({
      ...rest,
      label: formatElectiveLabel(rest.subjects),
    });
  });

  others.forEach((entry) => {
    const type = inferEntryType(entry);
    items.push({
      type,
      day: entry.day,
      slot: entry.slot,
      section: entry.section,
      program: entry.program,
      semester: entry.semester,
      subject: entry.subject,
      faculty: entry.faculty,
      room: entry.room,
      ...(type === 'lab' ? { batch: entry.batch } : {}),
      ...(type === 'special' ? { isSpecial: true } : {}),
    });
  });

  return items.sort((a, b) => {
    const sec = (a.section || '').localeCompare(b.section || '');
    if (sec !== 0) return sec;
    if (a.type === 'elective' && b.type !== 'elective') return -1;
    if (b.type === 'elective' && a.type !== 'elective') return 1;
    return (a.subject || a.label || '').localeCompare(b.subject || b.label || '');
  });
};

export const getDisplayItemsForCell = (apiData, day, slotId) => {
  if (apiData?.display?.length) {
    return apiData.display.filter((d) => d.day === day && d.slot === slotId);
  }
  return groupCellDisplayItems(apiData?.entries || apiData || [], day, slotId);
};
