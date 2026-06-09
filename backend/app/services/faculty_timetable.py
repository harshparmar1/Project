"""Build faculty-specific timetable views from stored entries."""
from datetime import datetime
from typing import Any, Dict, List

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
SLOTS = [1, 2, 3, 4, 5, 6, 7, 8]


def _today_name() -> str:
    names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return names[datetime.now().weekday()]


def infer_entry_type(entry: Dict[str, Any]) -> str:
    subject = entry.get("subject", "")
    if subject in ("BUFFER SLOT", "TDPCL"):
        return "Special"
    if entry.get("is_elective") or entry.get("isElective"):
        return "Elective"
    if entry.get("batch"):
        return "Lab"
    return "Lecture"


def enrich_entry(entry: Dict[str, Any], is_clash: bool = False) -> Dict[str, Any]:
    return {
        "day": entry.get("day"),
        "slot": entry.get("slot"),
        "subject": entry.get("subject"),
        "program": entry.get("program"),
        "semester": entry.get("semester"),
        "section": entry.get("section"),
        "batch": entry.get("batch"),
        "room": entry.get("room"),
        "faculty": entry.get("faculty"),
        "type": infer_entry_type(entry),
        "is_elective": entry.get("is_elective") or entry.get("isElective", False),
        "elective_group": entry.get("elective_group") or entry.get("electiveGroup"),
        "is_clash": is_clash,
    }


def _is_lab_group(group: List[Dict[str, Any]]) -> bool:
    return all(
        e.get("batch")
        and not (e.get("is_elective") or e.get("isElective"))
        for e in group
    )


def detect_faculty_clashes(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Find slots where this faculty has conflicting assignments."""
    by_slot: Dict[tuple, List[Dict]] = {}
    clashes = []

    for entry in entries:
        if entry.get("subject") in ("BUFFER SLOT",) or entry.get("faculty") in ("-", ""):
            continue
        key = (entry["day"], entry["slot"])
        by_slot.setdefault(key, []).append(entry)

    clash_keys = set()
    for key, group in by_slot.items():
        if len(group) <= 1:
            continue
        unique = {
            (e.get("subject"), e.get("program"), e.get("semester"), e.get("section"), e.get("batch"))
            for e in group
        }
        if len(unique) <= 1:
            continue
        subjects = {e.get("subject") for e in group}
        if len(subjects) == 1 and all(
            e.get("is_elective") or e.get("isElective") for e in group
        ):
            continue
        if len(subjects) == 1 and _is_lab_group(group):
            continue
        clash_keys.add(key)
        day, slot = key
        clashes.append({
            "day": day,
            "slot": slot,
            "entries": [enrich_entry(e, is_clash=True) for e in group],
        })

    return clashes, clash_keys


def build_faculty_timetable(faculty_name: str, raw_entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    entries = [e for e in raw_entries if e.get("faculty") == faculty_name]
    clashes, clash_keys = detect_faculty_clashes(entries)

    grouped: Dict[str, Dict[str, List[Dict]]] = {day: {} for day in DAYS}
    for day in DAYS:
        for slot in SLOTS:
            slot_entries = [
                e for e in entries if e.get("day") == day and e.get("slot") == slot
            ]
            enriched = [
                enrich_entry(e, is_clash=(day, slot) in clash_keys)
                for e in slot_entries
            ]
            grouped[day][str(slot)] = enriched

    today = _today_name()
    today_schedule = []
    if today in grouped:
        for slot in SLOTS:
            for item in grouped[today].get(str(slot), []):
                today_schedule.append({**item, "slot": slot})

    flat = []
    for day in DAYS:
        for slot in SLOTS:
            flat.extend(grouped[day].get(str(slot), []))

    return {
        "faculty": faculty_name,
        "entries": flat,
        "grouped": grouped,
        "clashes": clashes,
        "has_clashes": len(clashes) > 0,
        "today": today,
        "today_schedule": today_schedule,
    }
