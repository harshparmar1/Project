"""Odd/Even semester mode helpers and validation."""
from typing import List, Union

SEMESTERS_BY_MODE = {
    "odd": {"UG": [1, 3, 5], "PG": [1, 3]},
    "even": {"UG": [2, 4, 6], "PG": [2, 4]},
}

VALID_MODES = ("odd", "even")


def normalize_semester_type(value: Union[str, None]) -> str:
    if value is None:
        return "odd"
    v = str(value).strip().lower()
    if v in VALID_MODES:
        return v
    raise ValueError(f"Invalid semester_type '{value}'. Use 'odd' or 'even'.")


def get_semesters_for_program(program: str, semester_type: str) -> List[int]:
    mode = normalize_semester_type(semester_type)
    prog = program.upper() if isinstance(program, str) else str(program)
    return SEMESTERS_BY_MODE[mode].get(prog, [])


def is_valid_semester(program: str, semester: int, semester_type: str) -> bool:
    return semester in get_semesters_for_program(program, semester_type)


def validate_subject_semester(program: str, semester: int, semester_type: str) -> None:
    mode = normalize_semester_type(semester_type)
    if not is_valid_semester(program, semester, mode):
        allowed = get_semesters_for_program(program, mode)
        raise ValueError(
            f"Sem {semester} is invalid for {program} in {mode} mode. "
            f"Allowed semesters: {allowed}"
        )
