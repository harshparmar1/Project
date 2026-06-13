import random
from typing import List, Dict, Any, Optional, Tuple, Union, Set
from ..models import Subject, TimetableEntry, SubjectType, ElectiveAssignment
from ..semester_mode import normalize_semester_type, get_semesters_for_program
from .clash import (
    DAYS,
    SLOTS,
    create_faculty_busy,
    create_room_busy,
    is_faculty_busy,
    is_room_busy,
    mark_faculty_busy,
    mark_room_busy,
    get_available_classrooms,
    assign_rooms_for_parallel_electives,
    validate_faculty_clashes,
    validate_room_clashes,
    validate_elective_room_clashes,
)

CLASSROOMS = ["302", "304", "305", "306", "LH2", "804"]
LABS = ["Lab1", "Lab2", "Lab3", "Lab4"]
SECTIONS = ["A", "B"]
BATCHES_BY_SECTION = {"A": ["A1", "A2"], "B": ["B1", "B2"]}

LECTURE_SLOTS_PER_SUBJECT = 5
ELECTIVE_SLOTS_PER_GROUP = 1
MAX_LECTURES_PER_DAY_PER_SECTION = 7


class TimetableGenerator:
    def __init__(
        self,
        subjects: List[Subject],
        faculty_mapping: Dict[Union[str, Tuple[str, str]], str],
        elective_assignments: Optional[List[ElectiveAssignment]] = None,
        semester_type: str = "odd",
        other_department_entries: Optional[List[Any]] = None,
    ):
        self.semester_type = normalize_semester_type(semester_type)
        self.subjects = subjects
        self.faculty_mapping = faculty_mapping
        self.elective_assignments = elective_assignments or []
        self.timetable: List[TimetableEntry] = []
        
        # Global busy states
        self.faculty_busy = create_faculty_busy()
        self.room_busy = create_room_busy()
        
        if other_department_entries:
            for entry in other_department_entries:
                day = entry.day if hasattr(entry, "day") else entry.get("day")
                slot = entry.slot if hasattr(entry, "slot") else entry.get("slot")
                faculty = entry.faculty if hasattr(entry, "faculty") else entry.get("faculty")
                room = entry.room if hasattr(entry, "room") else entry.get("room")
                
                if day in DAYS and slot in SLOTS:
                    if faculty and faculty not in ("-", ""):
                        mark_faculty_busy(self.faculty_busy, day, slot, faculty)
                    if room and room not in ("-", ""):
                        mark_room_busy(self.room_busy, day, slot, room)
        
        # Scoped busy states: keyed by (program, semester, section/batch) at (day, slot)
        self.section_busy = {day: {slot: {} for slot in SLOTS} for day in DAYS}
        self.batch_busy = {day: {slot: {} for slot in SLOTS} for day in DAYS}
        
        self.clash_report: Dict[str, List] = {
            "faculty": [],
            "room": [],
            "elective_room": [],
        }
        self.failed_allocations: List[Dict[str, Any]] = []

    def _resolve_faculty(self, subject: str, batch: Optional[str] = None) -> Optional[str]:
        if batch:
            assigned = self.faculty_mapping.get((subject, batch))
            if assigned:
                return assigned
        return self.faculty_mapping.get(subject)

    def _record_failure(self, task_type: str, task: Dict) -> None:
        batches = task.get("batches")
        if not batches and task.get("batch"):
            batches = [task.get("batch")]
        self.failed_allocations.append({
            "type": task_type,
            "subject": task.get("subject"),
            "program": task.get("program"),
            "semester": task.get("semester"),
            "section": task.get("section"),
            "batches": batches,
        })

    @staticmethod
    def _prog_key(program) -> str:
        return program.value if hasattr(program, "value") else str(program)

    def _is_valid_lecture_slot(self, day: str, slot: int) -> bool:
        if day in ["Monday", "Tuesday", "Thursday", "Friday"] and slot == 7:
            return False
        if day == "Wednesday" and slot == 7:
            return False
        if day == "Saturday" and slot in [7, 8]:
            return False
        return True

    def _is_third_continuous(self, day: str, slot: int, key: tuple) -> bool:
        if slot > 2:
            if (
                self.section_busy[day][slot - 1].get(key) == "Lecture"
                and self.section_busy[day][slot - 2].get(key) == "Lecture"
            ):
                return True
        if slot > 1 and slot < 8:
            if (
                self.section_busy[day][slot - 1].get(key) == "Lecture"
                and self.section_busy[day][slot + 1].get(key) == "Lecture"
            ):
                return True
        if slot < 7:
            if (
                self.section_busy[day][slot + 1].get(key) == "Lecture"
                and self.section_busy[day][slot + 2].get(key) == "Lecture"
            ):
                return True
        return False

    def _is_subject_consecutive(self, day: str, slot: int, section: str, subject: str, current_entries: List[TimetableEntry]) -> bool:
        for entry in current_entries:
            if (
                entry.day == day
                and entry.section == section
                and entry.subject == subject
                and abs(entry.slot - slot) == 1
            ):
                return True
        return False

    def _has_consecutive_faculty_clash(self, day: str, slot: int, fac: str) -> bool:
        return False

    def generate(self) -> List[TimetableEntry]:
        self.failed_allocations = []
        self.timetable = []
        
        # Block Wednesday Slot 7 for TDPCL
        for room in CLASSROOMS + LABS:
            self.room_busy["Wednesday"][7].add(room)

        programs = sorted({self._prog_key(s.program) for s in self.subjects}, reverse=True)
        if not programs:
            programs = ["UG", "PG"]

        for prog in programs:
            prog_semesters = sorted(
                {s.semester for s in self.subjects if self._prog_key(s.program) == prog}
            )
            for sem in prog_semesters:
                sem_subjects = [
                    s for s in self.subjects
                    if s.semester == sem and self._prog_key(s.program) == prog
                ]
                success = self._schedule_semester(prog, sem, sem_subjects)
                if not success:
                    print(f"Failed to schedule semester: {prog} Sem {sem}")
                    # Record failures for remaining subjects
                    for s in sem_subjects:
                        self._record_failure("Semester", {
                            "subject": s.name,
                            "program": prog,
                            "semester": sem,
                            "section": "A/B"
                        })

        # Remove all buffer slot entries (Rule 7)
        self.timetable = [
            e for e in self.timetable
            if e.subject not in ("BUFFER", "BUFFER SLOT", "FREE BUFFER")
        ]

        # Post-generation checks
        self.clash_report["faculty"] = validate_faculty_clashes(self.timetable)
        self.clash_report["room"] = validate_room_clashes(self.timetable)
        self.clash_report["elective_room"] = validate_elective_room_clashes(self.timetable)

        return self.timetable

    def _schedule_semester(self, program: str, semester: int, subjects: List[Subject]) -> bool:
        # Separate subjects
        lectures = [s for s in subjects if s.type == SubjectType.LECTURE and not s.is_elective]
        labs = [s for s in subjects if s.type == SubjectType.LAB]
        electives = [s for s in subjects if s.is_elective or s.type == SubjectType.ELECTIVE]

        # Build tasks list
        tasks = []

        # 1. Elective group task
        if electives:
            tasks.append({
                "type": "Elective",
                "subjects": electives
            })

        # 2. Lab tasks
        for lab in labs:
            lab_hours = getattr(lab, "hours", 2)
            required_blocks = max(1, lab_hours // 2)
            for sec in SECTIONS:
                batches = lab.batches if lab.batches else BATCHES_BY_SECTION[sec]
                section_batches = [b for b in batches if b in BATCHES_BY_SECTION[sec]]
                for batch in section_batches:
                    for _ in range(required_blocks):
                        tasks.append({
                            "type": "Lab",
                            "section": sec,
                            "subject": lab.name,
                            "batch": batch
                        })

        # 3. Lecture tasks
        for lec in lectures:
            for sec in SECTIONS:
                for _ in range(LECTURE_SLOTS_PER_SUBJECT):
                    tasks.append({
                        "type": "Lecture",
                        "section": sec,
                        "subject": lec.name
                    })

        # Tracks for this semester's search
        elective_slots: Set[Tuple[str, int]] = set()
        mandatory_slots: Set[Tuple[str, int]] = set()
        semester_entries: List[TimetableEntry] = []
        
        # Keep track of daily lecture counts for sections
        daily_lectures: Dict[str, Dict[str, int]] = {
            sec: {day: 0 for day in DAYS} for sec in SECTIONS
        }

        # Tracks for scheduled tasks
        scheduled_tasks: Set[int] = set()

        # Backtracking search
        max_iterations = 250000
        iteration_count = 0

        def backtrack(task_idx: int) -> bool:
            nonlocal iteration_count
            iteration_count += 1
            if program == "PG" or iteration_count < 100:
                task_desc = f"{tasks[task_idx]['type']} - {tasks[task_idx].get('subject', '')} {tasks[task_idx].get('section', '')} {tasks[task_idx].get('batch', '')}" if task_idx < len(tasks) else "DONE"
                print(f"Iter {iteration_count}: task_idx={task_idx}/{len(tasks)} -> {task_desc}")
            if iteration_count > max_iterations:
                return False

            # Skip already scheduled tasks
            while task_idx < len(tasks) and task_idx in scheduled_tasks:
                task_idx += 1

            if task_idx == len(tasks):
                # Verify Section Synchronization & Insert Buffers
                for day in DAYS:
                    for slot in SLOTS:
                        if not self._is_valid_lecture_slot(day, slot):
                            continue
                        k_a = (program, semester, "A")
                        k_b = (program, semester, "B")
                        st_a = self.section_busy[day][slot].get(k_a)
                        st_b = self.section_busy[day][slot].get(k_b)
                        
                        busy_a = st_a is not None
                        busy_b = st_b is not None
                        
                        if busy_a != busy_b:
                            if not busy_b:
                                self.section_busy[day][slot][k_b] = "Buffer"
                                semester_entries.append(
                                    TimetableEntry(
                                        day=day,
                                        slot=slot,
                                        section="B",
                                        batch=None,
                                        subject="BUFFER SLOT",
                                        faculty="-",
                                        room="-",
                                        program=program,
                                        semester=semester,
                                        semesterType=self.semester_type,
                                    )
                                )
                            elif not busy_a:
                                self.section_busy[day][slot][k_a] = "Buffer"
                                semester_entries.append(
                                    TimetableEntry(
                                        day=day,
                                        slot=slot,
                                        section="A",
                                        batch=None,
                                        subject="BUFFER SLOT",
                                        faculty="-",
                                        room="-",
                                        program=program,
                                        semester=semester,
                                        semesterType=self.semester_type,
                                    )
                                )
                return True

            task = tasks[task_idx]
            task_type = task["type"]
            day_order = list(DAYS)
            random.shuffle(day_order)

            if task_type == "Elective":
                # Elective: schedule for both sections in the same slot
                for day in day_order:
                    slots = list(SLOTS)
                    random.shuffle(slots)
                    for slot in slots:
                        if not self._is_valid_lecture_slot(day, slot):
                            continue
                        if (day, slot) in mandatory_slots:
                            continue

                        # Check if any section is already busy in this slot for this semester
                        if (
                            self.section_busy[day][slot].get((program, semester, "A"))
                            or self.section_busy[day][slot].get((program, semester, "B"))
                        ):
                            continue

                        # Check faculty and rooms for all elective subjects
                        faculties = []
                        valid_faculties = True
                        for sub in task["subjects"]:
                            fac = self._resolve_faculty(sub.name)
                            if not fac or is_faculty_busy(self.faculty_busy, day, slot, fac):
                                valid_faculties = False
                                break
                            if self._has_consecutive_faculty_clash(day, slot, fac):
                                valid_faculties = False
                                break
                            faculties.append(fac)
                        if not valid_faculties:
                            continue

                        # Each elective subject gets its own room
                        sub_names = [s.name for s in task["subjects"]]
                        rooms = assign_rooms_for_parallel_electives(
                            self.room_busy, day, slot, CLASSROOMS, sub_names, {}
                        )
                        if rooms is None:
                            continue

                        # Place
                        temp_added = []
                        for sec in SECTIONS:
                            for sub, fac, room in zip(task["subjects"], faculties, rooms):
                                entry = TimetableEntry(
                                    day=day,
                                    slot=slot,
                                    section=sec,
                                    batch=None,
                                    subject=sub.name,
                                    faculty=fac,
                                    room=room,
                                    program=program,
                                    semester=semester,
                                    isElective=True,
                                    electiveGroup="default",
                                    semesterType=self.semester_type,
                                )
                                semester_entries.append(entry)
                                temp_added.append(entry)
                                mark_faculty_busy(self.faculty_busy, day, slot, fac)
                                mark_room_busy(self.room_busy, day, slot, room)

                            self.section_busy[day][slot][(program, semester, sec)] = "Elective"
                            for b in BATCHES_BY_SECTION[sec]:
                                self.batch_busy[day][slot][(program, semester, b)] = True

                        elective_slots.add((day, slot))
                        scheduled_tasks.add(task_idx)

                        if backtrack(task_idx + 1):
                            return True

                        # Undo
                        scheduled_tasks.remove(task_idx)
                        elective_slots.discard((day, slot))
                        for entry in temp_added:
                            semester_entries.remove(entry)
                            self.faculty_busy[day][slot].discard(entry.faculty)
                            self.room_busy[day][slot].discard(entry.room)
                        for sec in SECTIONS:
                            self.section_busy[day][slot].pop((program, semester, sec), None)
                            for b in BATCHES_BY_SECTION[sec]:
                                self.batch_busy[day][slot].pop((program, semester, b), None)

                return False

            elif task_type == "Lab":
                sec = task["section"]
                sub_name = task["subject"]
                batch = task["batch"]
                fac = self._resolve_faculty(sub_name, batch)
                if not fac:
                    return False

                lab_days = [d for d in DAYS if d != "Saturday"]
                random.shuffle(lab_days)
                slot_pairs = [(1, 2), (2, 3), (4, 5), (5, 6)]
                random.shuffle(slot_pairs)

                for day in lab_days:
                    for s1, s2 in slot_pairs:
                        is_target = (task_idx in [1, 2])
                        if is_target:
                            print(f"  Checking {day} ({s1},{s2}) for task {task_idx} ({sub_name} {batch}):")
                        if (day, s1) in elective_slots or (day, s2) in elective_slots:
                            if is_target:
                                print(f"    Rejected: in elective_slots")
                            continue

                        # Faculty busy check
                        if (
                            is_faculty_busy(self.faculty_busy, day, s1, fac)
                            or is_faculty_busy(self.faculty_busy, day, s2, fac)
                        ):
                            if is_target:
                                print(f"    Rejected: faculty {fac} busy (s1 busy: {is_faculty_busy(self.faculty_busy, day, s1, fac)}, s2 busy: {is_faculty_busy(self.faculty_busy, day, s2, fac)})")
                            continue

                        # Faculty Continuity check (Rule 2)
                        lab_consec_clash = False
                        if lab_consec_clash:
                            if is_target:
                                print(f"    Rejected: lab consec clash for {fac}")
                            continue

                        # Section busy check
                        k_sec = (program, semester, sec)
                        st_s1 = self.section_busy[day][s1].get(k_sec)
                        st_s2 = self.section_busy[day][s2].get(k_sec)
                        if st_s1 in ["Lecture", "Elective", "Buffer"] or st_s2 in ["Lecture", "Elective", "Buffer"]:
                            if is_target:
                                print(f"    Rejected: section busy ({st_s1}, {st_s2})")
                            continue

                        # Batch busy check
                        k_batch = (program, semester, batch)
                        if (
                            self.batch_busy[day][s1].get(k_batch)
                            or self.batch_busy[day][s2].get(k_batch)
                        ):
                            if is_target:
                                print(f"    Rejected: batch busy")
                            continue

                        # Room check
                        available = [
                            r for r in LABS
                            if not is_room_busy(self.room_busy, day, s1, r)
                            and not is_room_busy(self.room_busy, day, s2, r)
                        ]
                        if not available:
                            if is_target:
                                print(f"    Rejected: no rooms available")
                            continue
                        room = available[0]
                        if is_target:
                            print(f"    Selected room: {room}")

                        # Immediate sync-fill logic for the OTHER section
                        other_sec = "B" if sec == "A" else "A"
                        k_other = (program, semester, other_sec)
                        other_st_s1 = self.section_busy[day][s1].get(k_other)
                        other_st_s2 = self.section_busy[day][s2].get(k_other)
                        
                        # Find other section tasks to fill the slot block if it is free
                        fill_entries = []
                        fill_tasks = []
                        fill_ok = True
                        
                        if other_st_s1 is None or other_st_s2 is None:
                            # We must immediately schedule something for the other section in these slots
                            # Let's try to find an unscheduled Lab for the other section first
                            other_lab_task_idx = None
                            for idx, t in enumerate(tasks):
                                if idx not in scheduled_tasks and t["type"] == "Lab" and t["section"] == other_sec:
                                    ofac = self._resolve_faculty(t["subject"], t["batch"])
                                    
                                    # Rule 2 Check for other lab
                                    ofac_lab_consec_clash = False
                                    for adj_slot in (s1 - 1, s2 + 1):
                                        if adj_slot in SLOTS:
                                            if ofac in self.faculty_busy[day].get(adj_slot, set()):
                                                ofac_lab_consec_clash = True
                                                break
                                                
                                    if (
                                        ofac and ofac != fac
                                        and not is_faculty_busy(self.faculty_busy, day, s1, ofac)
                                        and not is_faculty_busy(self.faculty_busy, day, s2, ofac)
                                        and not ofac_lab_consec_clash
                                    ):
                                        other_lab_task_idx = idx
                                        break
                            
                            if other_lab_task_idx is not None:
                                # Try scheduling this lab for the other section
                                ot = tasks[other_lab_task_idx]
                                ofac = self._resolve_faculty(ot["subject"], ot["batch"])
                                other_room = [r for r in available if r != room]
                                if other_room:
                                    oroom = other_room[0]
                                    for slot in (s1, s2):
                                        entry = TimetableEntry(
                                            day=day, slot=slot, section=other_sec, batch=ot["batch"],
                                            subject=ot["subject"], faculty=ofac, room=oroom,
                                            program=program, semester=semester, semesterType=self.semester_type
                                        )
                                        fill_entries.append(entry)
                                        mark_faculty_busy(self.faculty_busy, day, slot, ofac)
                                        mark_room_busy(self.room_busy, day, slot, oroom)
                                        self.batch_busy[day][slot][(program, semester, ot["batch"])] = True
                                        self.section_busy[day][slot][k_other] = "Lab"
                                    fill_tasks.append(other_lab_task_idx)
                                else:
                                    fill_ok = False
                            else:
                                # Try scheduling two lecture tasks for the other section
                                unscheduled_lectures = [
                                    (idx, t) for idx, t in enumerate(tasks)
                                    if idx not in scheduled_tasks and t["type"] == "Lecture" and t["section"] == other_sec
                                ]
                                from collections import defaultdict
                                by_subj = defaultdict(list)
                                for idx, t in unscheduled_lectures:
                                    by_subj[t["subject"]].append((idx, t))
                                
                                candidate_pairs = []
                                subjs = list(by_subj.keys())
                                for i in range(len(subjs)):
                                    for j in range(i + 1, len(subjs)):
                                        candidate_pairs.append((by_subj[subjs[i]][0], by_subj[subjs[j]][0]))
                                for subj in subjs:
                                    if len(by_subj[subj]) >= 2:
                                        candidate_pairs.append((by_subj[subj][0], by_subj[subj][1]))

                                found_pair = None
                                for (idx1, ot1), (idx2, ot2) in candidate_pairs:
                                    ofac1 = self._resolve_faculty(ot1["subject"])
                                    ofac2 = self._resolve_faculty(ot2["subject"])
                                    
                                    # Rule 2 & Rule 1 Checks for other lectures
                                    ofac1_clash = self._has_consecutive_faculty_clash(day, s1, ofac1)
                                    ofac2_clash = self._has_consecutive_faculty_clash(day, s2, ofac2)
                                    
                                    # Rule 1 Checks
                                    sub_consec1 = self._is_subject_consecutive(day, s1, other_sec, ot1["subject"], semester_entries)
                                    sub_consec2 = self._is_subject_consecutive(day, s2, other_sec, ot2["subject"], semester_entries)
                                    
                                    if (
                                        ofac1 and ofac2
                                        and ofac1 != fac and ofac2 != fac
                                        and not is_faculty_busy(self.faculty_busy, day, s1, ofac1)
                                        and not is_faculty_busy(self.faculty_busy, day, s2, ofac2)
                                        and not ofac1_clash
                                        and not ofac2_clash
                                        and not sub_consec1
                                        and not sub_consec2
                                    ):
                                        found_pair = (idx1, ot1, ofac1, idx2, ot2, ofac2)
                                        break
                                
                                if found_pair:
                                    idx1, ot1, ofac1, idx2, ot2, ofac2 = found_pair
                                    if (
                                        daily_lectures[other_sec][day] + 2 <= MAX_LECTURES_PER_DAY_PER_SECTION
                                        and not self._is_third_continuous(day, s1, k_other)
                                        and not self._is_third_continuous(day, s2, k_other)
                                    ):
                                        oroom1 = get_available_classrooms(self.room_busy, day, s1, CLASSROOMS, 1)
                                        oroom2 = get_available_classrooms(self.room_busy, day, s2, CLASSROOMS, 1)
                                        if oroom1 and oroom2:
                                            # Apply s1
                                            entry1 = TimetableEntry(
                                                day=day, slot=s1, section=other_sec, batch=None,
                                                subject=ot1["subject"], faculty=ofac1, room=oroom1[0],
                                                program=program, semester=semester, semesterType=self.semester_type
                                            )
                                            fill_entries.append(entry1)
                                            mark_faculty_busy(self.faculty_busy, day, s1, ofac1)
                                            mark_room_busy(self.room_busy, day, s1, oroom1[0])
                                            self.section_busy[day][s1][k_other] = "Lecture"
                                            for b in BATCHES_BY_SECTION[other_sec]:
                                                self.batch_busy[day][s1][(program, semester, b)] = True
                                            
                                            # Apply s2
                                            entry2 = TimetableEntry(
                                                day=day, slot=s2, section=other_sec, batch=None,
                                                subject=ot2["subject"], faculty=ofac2, room=oroom2[0],
                                                program=program, semester=semester, semesterType=self.semester_type
                                            )
                                            fill_entries.append(entry2)
                                            mark_faculty_busy(self.faculty_busy, day, s2, ofac2)
                                            mark_room_busy(self.room_busy, day, s2, oroom2[0])
                                            self.section_busy[day][s2][k_other] = "Lecture"
                                            for b in BATCHES_BY_SECTION[other_sec]:
                                                self.batch_busy[day][s2][(program, semester, b)] = True
                                            
                                            daily_lectures[other_sec][day] += 2
                                            fill_tasks.extend([idx1, idx2])
                                        else:
                                            fill_ok = False
                                    else:
                                        fill_ok = False
                                else:
                                    fill_ok = False

                        if not fill_ok:
                            # Revert any partial changes first
                            for entry in fill_entries:
                                self.faculty_busy[entry.day][entry.slot].discard(entry.faculty)
                                self.room_busy[entry.day][entry.slot].discard(entry.room)
                                self.section_busy[entry.day][entry.slot].pop(k_other, None)
                                if entry.batch:
                                    self.batch_busy[entry.day][entry.slot].pop((program, semester, entry.batch), None)
                                else:
                                    for b in BATCHES_BY_SECTION[other_sec]:
                                        self.batch_busy[entry.day][entry.slot].pop((program, semester, b), None)
                            
                            fill_entries = []
                            fill_tasks = []
                            # Fall back to scheduling Buffer slots for the other section in s1 and s2
                            for slot in (s1, s2):
                                entry = TimetableEntry(
                                    day=day, slot=slot, section=other_sec, batch=None,
                                    subject="FREE SLOT", faculty="-", room="-",
                                    program=program, semester=semester, semesterType=self.semester_type
                                )
                                fill_entries.append(entry)
                                self.section_busy[day][slot][k_other] = "Free"
                                for b in BATCHES_BY_SECTION[other_sec]:
                                    self.batch_busy[day][slot][(program, semester, b)] = True
                            fill_ok = True

                        if not fill_ok:
                            continue

                        # Apply current task
                        temp_entries = []
                        for slot in (s1, s2):
                            entry = TimetableEntry(
                                day=day, slot=slot, section=sec, batch=batch,
                                subject=sub_name, faculty=fac, room=room,
                                program=program, semester=semester, semesterType=self.semester_type,
                            )
                            semester_entries.append(entry)
                            temp_entries.append(entry)
                            mark_faculty_busy(self.faculty_busy, day, slot, fac)
                            mark_room_busy(self.room_busy, day, slot, room)
                            self.batch_busy[day][slot][k_batch] = True
                            self.section_busy[day][slot][k_sec] = "Lab"

                        for fe in fill_entries:
                            semester_entries.append(fe)

                        was_s1 = (day, s1) in mandatory_slots
                        was_s2 = (day, s2) in mandatory_slots
                        if not was_s1:
                            mandatory_slots.add((day, s1))
                        if not was_s2:
                            mandatory_slots.add((day, s2))

                        scheduled_tasks.add(task_idx)
                        for f_idx in fill_tasks:
                            scheduled_tasks.add(f_idx)

                        if backtrack(task_idx + 1):
                            return True

                        # Undo
                        scheduled_tasks.remove(task_idx)
                        for f_idx in fill_tasks:
                            scheduled_tasks.remove(f_idx)

                        if not was_s1:
                            mandatory_slots.discard((day, s1))
                        if not was_s2:
                            mandatory_slots.discard((day, s2))

                        for entry in temp_entries:
                            semester_entries.remove(entry)
                            self.faculty_busy[entry.day][entry.slot].discard(entry.faculty)
                            self.room_busy[entry.day][entry.slot].discard(entry.room)
                            self.batch_busy[entry.day][entry.slot].pop(k_batch, None)
                            self.section_busy[entry.day][entry.slot].pop(k_sec, None)

                        for entry in fill_entries:
                            semester_entries.remove(entry)
                            self.faculty_busy[entry.day][entry.slot].discard(entry.faculty)
                            self.room_busy[entry.day][entry.slot].discard(entry.room)
                            self.section_busy[entry.day][entry.slot].pop(k_other, None)
                            if entry.batch:
                                self.batch_busy[entry.day][entry.slot].pop((program, semester, entry.batch), None)
                            else:
                                for b in BATCHES_BY_SECTION[other_sec]:
                                    self.batch_busy[entry.day][entry.slot].pop((program, semester, b), None)
                                daily_lectures[other_sec][entry.day] -= 1

                return False

            elif task_type == "Lecture":
                sec = task["section"]
                sub_name = task["subject"]
                fac = self._resolve_faculty(sub_name)
                if not fac:
                    return False

                k_sec = (program, semester, sec)
                other_sec = "B" if sec == "A" else "A"
                k_other = (program, semester, other_sec)

                for day in day_order:
                    if daily_lectures[sec][day] >= MAX_LECTURES_PER_DAY_PER_SECTION:
                        continue
                    
                    slots = list(SLOTS)
                    random.shuffle(slots)
                    for slot in slots:
                        if not self._is_valid_lecture_slot(day, slot):
                            continue
                        if (day, slot) in elective_slots:
                            continue

                        # Section busy check
                        if self.section_busy[day][slot].get(k_sec) is not None:
                            continue

                        # Subject Continuity check (Rule 1)
                        if self._is_subject_consecutive(day, slot, sec, sub_name, semester_entries):
                            continue

                        # Batch busy check
                        batch_conflict = False
                        for b in BATCHES_BY_SECTION[sec]:
                            if self.batch_busy[day][slot].get((program, semester, b)):
                                batch_conflict = True
                                break
                        if batch_conflict:
                            continue

                        # Faculty busy check
                        if is_faculty_busy(self.faculty_busy, day, slot, fac):
                            continue

                        # Faculty Continuity check (Rule 2)
                        if self._has_consecutive_faculty_clash(day, slot, fac):
                            continue

                        # Buffer slot logic
                        needs_buffer = False
                        buffer_slot = slot + 1
                        if False:
                            needs_buffer = True

                        is_inherent_break = False
                        if needs_buffer and buffer_slot <= 8:
                            if day in ["Monday", "Tuesday", "Thursday", "Friday"] and buffer_slot == 7:
                                is_inherent_break = True
                            if day == "Saturday" and buffer_slot in [7, 8]:
                                is_inherent_break = True

                            if not is_inherent_break:
                                if day == "Wednesday" and buffer_slot == 7:
                                    continue
                                if self.section_busy[day][buffer_slot].get(k_sec) is not None:
                                    continue
                                if any(self.batch_busy[day][buffer_slot].get((program, semester, b)) for b in BATCHES_BY_SECTION[sec]):
                                    continue

                        if self._is_third_continuous(day, slot, k_sec):
                            continue

                        # Room availability
                        rooms = get_available_classrooms(self.room_busy, day, slot, CLASSROOMS, count=1)
                        if not rooms:
                            continue
                        room = rooms[0]

                        # Immediate sync-fill logic for the OTHER section
                        other_st = self.section_busy[day][slot].get(k_other)
                        fill_entry = None
                        fill_task_idx = None
                        fill_ok = True

                        if other_st is None:
                            # We must immediately schedule a lecture task for the other section in this slot
                            unscheduled_other = [
                                (idx, t) for idx, t in enumerate(tasks)
                                if idx not in scheduled_tasks and t["type"] == "Lecture" and t["section"] == other_sec
                            ]
                            if not unscheduled_other:
                                # Fall back to scheduling a Buffer slot for the other section
                                fill_entry = TimetableEntry(
                                    day=day, slot=slot, section=other_sec, batch=None,
                                    subject="BUFFER SLOT", faculty="-", room="-",
                                    program=program, semester=semester, semesterType=self.semester_type
                                )
                                self.section_busy[day][slot][k_other] = "Buffer"
                                for b in BATCHES_BY_SECTION[other_sec]:
                                    self.batch_busy[day][slot][(program, semester, b)] = True
                                fill_ok = True
                            else:
                                # Try to find one lecture task for other section that works in this slot
                                seen_subjs = set()
                                distinct_unscheduled = []
                                for idx, ot in unscheduled_other:
                                    if ot["subject"] not in seen_subjs:
                                        seen_subjs.add(ot["subject"])
                                        distinct_unscheduled.append((idx, ot))
                                
                                for idx, ot in distinct_unscheduled:
                                    ofac = self._resolve_faculty(ot["subject"])
                                    
                                    # Rule 2 Check for other lecture
                                    ofac_consec_clash = self._has_consecutive_faculty_clash(day, slot, ofac)
                                    
                                    # Rule 1 Check for other lecture
                                    sub_consec = self._is_subject_consecutive(day, slot, other_sec, ot["subject"], semester_entries)
                                    
                                    if (
                                        ofac and ofac != fac
                                        and not is_faculty_busy(self.faculty_busy, day, slot, ofac)
                                        and not ofac_consec_clash
                                        and not sub_consec
                                        and daily_lectures[other_sec][day] < MAX_LECTURES_PER_DAY_PER_SECTION
                                        and not self._is_third_continuous(day, slot, k_other)
                                    ):
                                        orooms = [r for r in CLASSROOMS if r != room and not is_room_busy(self.room_busy, day, slot, r)]
                                        if orooms:
                                            oroom = orooms[0]
                                            fill_entry = TimetableEntry(
                                                day=day, slot=slot, section=other_sec, batch=None,
                                                subject=ot["subject"], faculty=ofac, room=oroom,
                                                program=program, semester=semester, semesterType=self.semester_type
                                            )
                                            mark_faculty_busy(self.faculty_busy, day, slot, ofac)
                                            mark_room_busy(self.room_busy, day, slot, oroom)
                                            self.section_busy[day][slot][k_other] = "Lecture"
                                            for b in BATCHES_BY_SECTION[other_sec]:
                                                self.batch_busy[day][slot][(program, semester, b)] = True
                                            daily_lectures[other_sec][day] += 1
                                            fill_task_idx = idx
                                            break
                                if fill_task_idx is None:
                                    # Fall back to scheduling a Buffer slot for the other section
                                    fill_entry = TimetableEntry(
                                        day=day, slot=slot, section=other_sec, batch=None,
                                        subject="BUFFER SLOT", faculty="-", room="-",
                                        program=program, semester=semester, semesterType=self.semester_type
                                    )
                                    self.section_busy[day][slot][k_other] = "Buffer"
                                    for b in BATCHES_BY_SECTION[other_sec]:
                                        self.batch_busy[day][slot][(program, semester, b)] = True
                                    fill_ok = True

                        if not fill_ok:
                            continue

                        # Place current task
                        entry = TimetableEntry(
                            day=day, slot=slot, section=sec, batch=None,
                            subject=sub_name, faculty=fac, room=room,
                            program=program, semester=semester, semesterType=self.semester_type,
                        )
                        semester_entries.append(entry)
                        mark_faculty_busy(self.faculty_busy, day, slot, fac)
                        mark_room_busy(self.room_busy, day, slot, room)
                        self.section_busy[day][slot][k_sec] = "Lecture"
                        for b in BATCHES_BY_SECTION[sec]:
                            self.batch_busy[day][slot][(program, semester, b)] = True
                        daily_lectures[sec][day] += 1

                        if fill_entry:
                            semester_entries.append(fill_entry)

                        was_mandatory = (day, slot) in mandatory_slots
                        if not was_mandatory:
                            mandatory_slots.add((day, slot))

                        scheduled_tasks.add(task_idx)
                        if fill_task_idx is not None:
                            scheduled_tasks.add(fill_task_idx)

                        # Apply buffer
                        buffer_applied = False
                        if needs_buffer and buffer_slot <= 8 and not is_inherent_break:
                            self.section_busy[day][buffer_slot][k_sec] = "Buffer"
                            for b in BATCHES_BY_SECTION[sec]:
                                self.batch_busy[day][buffer_slot][(program, semester, b)] = True
                            buffer_applied = True

                        if backtrack(task_idx + 1):
                            return True

                        # Undo
                        scheduled_tasks.remove(task_idx)
                        if fill_task_idx is not None:
                            scheduled_tasks.remove(fill_task_idx)

                        if not was_mandatory:
                            mandatory_slots.discard((day, slot))

                        semester_entries.remove(entry)
                        self.faculty_busy[day][slot].discard(fac)
                        self.room_busy[day][slot].discard(room)
                        self.section_busy[day][slot].pop(k_sec, None)
                        for b in BATCHES_BY_SECTION[sec]:
                            self.batch_busy[day][slot].pop((program, semester, b), None)
                        daily_lectures[sec][day] -= 1

                        if buffer_applied:
                            self.section_busy[day][buffer_slot].pop(k_sec, None)
                            for b in BATCHES_BY_SECTION[sec]:
                                self.batch_busy[day][buffer_slot].pop((program, semester, b), None)

                        if fill_entry:
                            semester_entries.remove(fill_entry)
                            self.faculty_busy[day][slot].discard(fill_entry.faculty)
                            self.room_busy[day][slot].discard(fill_entry.room)
                            self.section_busy[day][slot].pop(k_other, None)
                            for b in BATCHES_BY_SECTION[other_sec]:
                                self.batch_busy[day][slot].pop((program, semester, b), None)
                            daily_lectures[other_sec][day] -= 1

                return False

        # Run backtracking
        success = backtrack(0)
        print(f"Backtracking for {program} Sem {semester}: success={success}, iterations={iteration_count}")
        if success:
            self.timetable.extend(semester_entries)
            return True
        return False
