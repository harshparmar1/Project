export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const SLOTS = [
  { id: 1, time: '8:40–9:30' },
  { id: 2, time: '9:30–10:20' },
  { id: 3, time: '10:20–11:10' },
  { id: 0, time: 'Break', isBreak: true },
  { id: 4, time: '11:40–12:30' },
  { id: 5, time: '12:30–1:20' },
  { id: 6, time: '1:20–2:10' },
  { id: 7, time: '2:10–3:00' },
  { id: 8, time: '3:00–3:50' },
];

export const SECTIONS = ['A', 'B'];
export const BATCHES_BY_SECTION = { A: ['A1', 'A2'], B: ['B1', 'B2'] };
export const ALL_BATCHES = ['A1', 'A2', 'B1', 'B2'];

export const getBatchesForSection = (section) =>
  BATCHES_BY_SECTION[section] || BATCHES_BY_SECTION.A;

/** Detect elective room conflicts: different electives at the same day+slot+room only. */
export const detectElectiveRoomConflicts = (entries) => {
  const conflicts = [];
  const electiveSlots = {};

  entries
    .filter((e) => e.isElective || e.is_elective)
    .forEach((e) => {
      if (!e.room || e.room === '-') return;
      const key = `${e.day}|${e.slot}|${e.room}`;
      electiveSlots[key] = electiveSlots[key] || [];
      electiveSlots[key].push(e);
    });

  Object.entries(electiveSlots).forEach(([key, group]) => {
    const subjects = new Set(group.map((e) => e.subject));
    if (subjects.size > 1) {
      const [day, slot, room] = key.split('|');
      conflicts.push({
        day,
        slot: Number(slot),
        room,
        message: 'Different electives cannot use the same room at the same time',
        entries: group,
      });
    }
  });

  return conflicts;
};

export const isEntryRoomConflict = (entry, conflicts) =>
  conflicts.some(
    (c) =>
      c.day === entry.day &&
      c.slot === entry.slot &&
      c.room === entry.room &&
      (entry.isElective || entry.is_elective)
  );

export const getTodayName = () => {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[new Date().getDay()];
};

export const inferEntryType = (entry) => {
  if (entry.type === 'elective' || entry.isElective || entry.is_elective) return 'Elective';
  if (entry.type === 'lab') return 'Lab';
  if (entry.type === 'lecture') return 'Lecture';
  if (entry.subject === 'FREE SLOT' || entry.subject === 'TDPCL') return 'Special';
  if (entry.isElective || entry.is_elective) return 'Elective';
  if (entry.batch) return 'Lab';
  return 'Lecture';
};

export const TYPE_STYLES = {
  Lecture: {
    card: 'bg-primary-500/10 border-primary-500/30',
    title: 'text-primary-600 dark:text-primary-400',
    badge: 'bg-primary-500/20 text-primary-700 dark:text-primary-300',
  },
  Lab: {
    card: 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/20',
    title: 'text-cyan-700 dark:text-cyan-300',
    badge: 'bg-cyan-500/25 text-cyan-800 dark:text-cyan-200',
  },
  Elective: {
    card: 'bg-violet-500/10 border-violet-500/40 ring-1 ring-violet-500/20',
    title: 'text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-500/25 text-violet-800 dark:text-violet-200',
  },
  Special: {
    card: 'bg-amber-500/10 border-amber-500/30',
    title: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  },
  Clash: {
    card: 'bg-rose-500/15 border-rose-500/50 ring-2 ring-rose-500/40',
    title: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-500/30 text-rose-800 dark:text-rose-200',
  },
};
