"""Reusable clash detection for timetable scheduling."""
from typing import Dict, List, Set, Optional, Any

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
SLOTS = [1, 2, 3, 4, 5, 6, 7, 8]


def create_faculty_busy() -> Dict[str, Dict[int, Set[str]]]:
    """Global faculty occupancy: faculty_schedule[(day, slot)] via nested dict."""
    return {day: {slot: set() for slot in SLOTS} for day in DAYS}


def create_room_busy() -> Dict[str, Dict[int, Set[str]]]:
    return {day: {slot: set() for slot in SLOTS} for day in DAYS}


def is_faculty_busy(
    faculty_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    faculty: str,
) -> bool:
    """True if faculty is already assigned anywhere at this day/slot (UG+PG global)."""
    return faculty in faculty_busy.get(day, {}).get(slot, set())


def is_room_busy(
    room_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    room: str,
) -> bool:
    return room in room_busy.get(day, {}).get(slot, set())


def mark_faculty_busy(
    faculty_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    faculty: str,
) -> None:
    faculty_busy[day][slot].add(faculty)


def mark_room_busy(
    room_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    room: str,
) -> None:
    room_busy[day][slot].add(room)


def get_available_classrooms(
    room_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    classrooms: List[str],
    count: int = 1,
) -> List[str]:
    """Return up to `count` distinct free classrooms at day/slot (same slot only)."""
    free = [r for r in classrooms if not is_room_busy(room_busy, day, slot, r)]
    return free[:count]


def assign_distinct_rooms_for_slot(
    room_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    classrooms: List[str],
    count: int,
) -> Optional[List[str]]:
    """
    Assign `count` different rooms at the same (day, slot).
    Returns None if not enough free rooms (simultaneous electives must not share a room).
    """
    if count <= 0:
        return []
    rooms = get_available_classrooms(room_busy, day, slot, classrooms, count=count)
    if len(rooms) < count:
        return None
    return rooms


def assign_rooms_for_parallel_electives(
    room_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    classrooms: List[str],
    subject_names: List[str],
    elective_room_by_subject: Dict[str, str],
) -> Optional[List[str]]:
    """
    Assign one room per elective subject at (day, slot).
    - Parallel electives at the same time always get different rooms.
    - Each elective subject keeps a dedicated room for the whole timetable
      (two elective subjects never share the same room).
    """
    if not subject_names:
        return []

    rooms_used_this_slot: Set[str] = set()
    rooms_owned_by_other_electives = set(elective_room_by_subject.values())
    result: List[str] = []

    for name in subject_names:
        room: Optional[str] = None

        if name in elective_room_by_subject:
            candidate = elective_room_by_subject[name]
            if (
                candidate not in rooms_used_this_slot
                and not is_room_busy(room_busy, day, slot, candidate)
            ):
                room = candidate

        if room is None:
            for candidate in classrooms:
                if candidate in rooms_used_this_slot:
                    continue
                if candidate in rooms_owned_by_other_electives:
                    continue
                if is_room_busy(room_busy, day, slot, candidate):
                    continue
                room = candidate
                elective_room_by_subject[name] = candidate
                rooms_owned_by_other_electives.add(candidate)
                break

        if room is None:
            return None

        elective_room_by_subject[name] = room
        rooms_used_this_slot.add(room)
        result.append(room)

    if len(set(result)) != len(result):
        return None
    return result


def is_room_occupied_at_slot(
    room_busy: Dict[str, Dict[int, Set[str]]],
    day: str,
    slot: int,
    room: str,
) -> bool:
    """room_schedule[(day, slot, room)] — occupied at this time only."""
    return is_room_busy(room_busy, day, slot, room)


def _entry_is_lab(entry: Any) -> bool:
    batch = getattr(entry, "batch", None) if not isinstance(entry, dict) else entry.get("batch")
    is_elec = getattr(entry, "is_elective", False) or getattr(entry, "isElective", False)
    if isinstance(entry, dict):
        is_elec = is_elec or entry.get("is_elective") or entry.get("isElective")
    return bool(batch) and not is_elec


def _is_valid_lab_same_slot_group(group: List[Any]) -> bool:
    """One lab subject, multiple batches at the same slot (different faculty each) is OK."""
    if len({e.subject if not isinstance(e, dict) else e.get("subject") for e in group}) != 1:
        return False
    batches = {
        getattr(e, "batch", None) if not isinstance(e, dict) else e.get("batch")
        for e in group
    }
    return len(batches) > 1 and all(batches)


def validate_faculty_clashes(entries: List[Any]) -> List[Dict]:
    """
    Post-generation audit: detect faculty double-booked at same day/slot
    across all programs, semesters, sections, and entry types.
    """
    slot_faculty: Dict[tuple, Dict[str, List[Any]]] = {}
    clashes = []

    for entry in entries:
        if getattr(entry, "subject", None) in ("FREE SLOT",) or getattr(entry, "faculty", "-") in ("-", ""):
            continue
        key = (entry.day, entry.slot)
        fac = entry.faculty
        slot_faculty.setdefault(key, {}).setdefault(fac, []).append(entry)

    for (day, slot), faculty_map in slot_faculty.items():
        for faculty, group in faculty_map.items():
            if len(group) > 1:
                unique = {(e.program, e.semester, e.section, e.batch, e.subject) for e in group}
                if len(unique) <= 1:
                    continue
                # Same elective, same room, multiple batches is valid (not a clash)
                subjects = {e.subject for e in group}
                if len(subjects) == 1 and all(
                    getattr(e, "is_elective", False) or getattr(e, "isElective", False)
                    for e in group
                ):
                    continue
                if _is_valid_lab_same_slot_group(group):
                    continue
                clashes.append({
                        "type": "faculty",
                        "faculty": faculty,
                        "day": day,
                        "slot": slot,
                        "entries": [
                            {
                                "program": e.program,
                                "semester": e.semester,
                                "section": e.section,
                                "batch": e.batch,
                                "subject": e.subject,
                                "room": e.room,
                            }
                            for e in group
                        ],
                    })
    return clashes


def validate_room_clashes(entries: List[Any]) -> List[Dict]:
    """Detect room double-booked at same day/slot."""
    slot_room: Dict[tuple, Dict[str, List[Any]]] = {}
    clashes = []

    for entry in entries:
        if getattr(entry, "room", "-") in ("-", ""):
            continue
        key = (entry.day, entry.slot)
        room = entry.room
        slot_room.setdefault(key, {}).setdefault(room, []).append(entry)

    for (day, slot), room_map in slot_room.items():
        for room, group in room_map.items():
            if len(group) > 1:
                unique = {(e.program, e.semester, e.section, e.batch, e.subject) for e in group}
                if len(unique) <= 1:
                    continue
                subjects = {e.subject for e in group}
                if len(subjects) == 1 and all(
                    getattr(e, "is_elective", False) or getattr(e, "isElective", False)
                    for e in group
                ):
                    continue
                if _is_valid_lab_same_slot_group(group):
                    continue
                clashes.append({
                        "type": "room",
                        "room": room,
                        "day": day,
                        "slot": slot,
                        "entries": [
                            {
                                "program": e.program,
                                "semester": e.semester,
                                "section": e.section,
                                "batch": e.batch,
                                "subject": e.subject,
                                "faculty": e.faculty,
                            }
                            for e in group
                        ],
                    })
    return clashes


def validate_elective_room_clashes(entries: List[Any]) -> List[Dict]:
    """
    Elective rule: at the same (day, slot), different elective subjects must use different rooms.
    (Same room on different days/times is allowed.)
    """
    slot_entries: Dict[tuple, List[Any]] = {}

    for entry in entries:
        if not (getattr(entry, "is_elective", False) or getattr(entry, "isElective", False)):
            continue
        if getattr(entry, "room", "-") in ("-", ""):
            continue
        key = (entry.day, entry.slot)
        slot_entries.setdefault(key, []).append(entry)

    clashes = []
    for (day, slot), group in slot_entries.items():
        by_room: Dict[str, List[Any]] = {}
        for e in group:
            by_room.setdefault(e.room, []).append(e)

        for room, room_group in by_room.items():
            subjects = {e.subject for e in room_group}
            if len(subjects) > 1:
                clashes.append({
                    "type": "elective_room",
                    "message": "Different electives cannot use the same room at the same time",
                    "day": day,
                    "slot": slot,
                    "room": room,
                    "subjects": list(subjects),
                    "entries": [
                        {
                            "subject": e.subject,
                            "section": e.section,
                            "batch": e.batch,
                            "room": e.room,
                            "faculty": getattr(e, "faculty", "-"),
                        }
                        for e in room_group
                    ],
                })
    return clashes
