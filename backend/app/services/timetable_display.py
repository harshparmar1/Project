"""Transform flat timetable rows into grouped display items for the UI."""
from typing import Any, Dict, List


def _is_elective(entry: Dict[str, Any]) -> bool:
    return bool(entry.get("is_elective") or entry.get("isElective"))


def _is_lab(entry: Dict[str, Any]) -> bool:
    if _is_elective(entry):
        return False
    if entry.get("subject") in ("BUFFER SLOT", "TDPCL"):
        return False
    return bool(entry.get("batch"))


def _entry_type(entry: Dict[str, Any]) -> str:
    if entry.get("subject") in ("BUFFER SLOT",):
        return "buffer"
    if entry.get("subject") == "TDPCL" or entry.get("isSpecial"):
        return "special"
    if _is_elective(entry):
        return "elective"
    if _is_lab(entry):
        return "lab"
    return "lecture"


def _base_fields(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "day": entry.get("day"),
        "slot": entry.get("slot"),
        "section": entry.get("section"),
        "program": entry.get("program"),
        "semester": entry.get("semester"),
        "semester_type": entry.get("semester_type") or entry.get("semesterType"),
        "elective_group": entry.get("elective_group") or entry.get("electiveGroup"),
    }


def group_timetable_for_display(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build display items for timetable cells.
    Electives at same day/slot/section are merged into one item with subjects[].
    Lectures: section-wise, no batch. Labs: per batch entry.
    """
    if not entries:
        return []

    by_slot: Dict[tuple, List[Dict]] = {}
    for entry in entries:
        key = (entry.get("day"), entry.get("slot"))
        by_slot.setdefault(key, []).append(entry)

    display: List[Dict[str, Any]] = []

    for (day, slot), slot_entries in by_slot.items():
        elective_groups: Dict[tuple, Dict[str, Any]] = {}
        others: List[Dict] = []

        for entry in slot_entries:
            if _entry_type(entry) == "elective":
                sec = entry.get("section", "")
                eg = entry.get("elective_group") or entry.get("electiveGroup") or ""
                gkey = (day, slot, sec, eg)
                if gkey not in elective_groups:
                    elective_groups[gkey] = {
                        "type": "elective",
                        **_base_fields(entry),
                        "subjects": [],
                        "_seen": set(),
                    }
                g = elective_groups[gkey]
                sub_key = (entry.get("subject"), entry.get("room"))
                if sub_key not in g["_seen"]:
                    g["_seen"].add(sub_key)
                    g["subjects"].append({
                        "name": entry.get("subject"),
                        "room": entry.get("room"),
                        "faculty": entry.get("faculty"),
                    })
            else:
                others.append(entry)

        for g in elective_groups.values():
            g.pop("_seen", None)
            g["label"] = " / ".join(
                f"{s['name']} ({s['room']})" for s in g["subjects"]
            )
            display.append(g)

        for entry in others:
            etype = _entry_type(entry)
            item = {
                "type": etype,
                **_base_fields(entry),
                "subject": entry.get("subject"),
                "faculty": entry.get("faculty"),
                "room": entry.get("room"),
            }
            if etype == "lab":
                item["batch"] = entry.get("batch")
            display.append(item)

    def sort_key(item):
        return (
            item.get("day", ""),
            item.get("slot", 0) or 0,
            item.get("section", ""),
            0 if item.get("type") == "elective" else 1,
            item.get("subject", "") or item.get("label", ""),
            item.get("batch", "") or "",
        )

    display.sort(key=sort_key)
    return display
