from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from enum import Enum

class ProgramType(str, Enum):
    UG = "UG"
    PG = "PG"


class SemesterType(str, Enum):
    ODD = "odd"
    EVEN = "even"

class SubjectType(str, Enum):
    LECTURE = "Lecture"
    LAB = "Lab"
    ELECTIVE = "Elective"

class Department(BaseModel):
    name: str
    code: str

class User(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    full_name: str = Field(alias="fullName")
    email: str
    password_hash: str = Field(alias="passwordHash")
    department: str

class UserSignup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    full_name: str = Field(alias="fullName")
    email: str
    password: str
    department: str
    department_code: str = Field(alias="departmentCode")

class UserLogin(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    email: str
    password: str
    department: str
    department_code: str = Field(alias="departmentCode")

class Subject(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    semester: int
    program: ProgramType
    type: SubjectType
    batches: List[str] = []
    is_elective: bool = Field(default=False, alias="isElective")
    elective_group: Optional[str] = Field(default="default", alias="electiveGroup")
    semester_type: SemesterType = Field(default=SemesterType.ODD, alias="semesterType")
    hours: int = Field(default=2)
    department: Optional[str] = None

class TeacherType(str, Enum):
    TEMPORARY = "Temporary"
    ASSISTANT = "Assistant"
    PERMANENT = "Permanent"


class Faculty(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    qualification: str = ""
    teacher_type: TeacherType = Field(default=TeacherType.ASSISTANT, alias="teacherType")
    department: Optional[str] = None

class FacultySubject(BaseModel):
    subject_name: str
    faculty_name: str
    batch: Optional[str] = None  # Required for lab subjects (one faculty per batch)
    department: Optional[str] = None

class ElectiveAssignment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    program: ProgramType
    semester: int
    section: str
    batch: str
    elective_subject: str = Field(alias="electiveSubject")
    elective_group: str = Field(alias="electiveGroup")
    semester_type: SemesterType = Field(default=SemesterType.ODD, alias="semesterType")
    department: Optional[str] = None

class TimetableEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    day: str
    slot: int
    section: str
    batch: Optional[str] = None
    subject: str
    faculty: str
    room: str
    program: str
    semester: int
    is_elective: bool = Field(default=False, alias="isElective")
    elective_group: Optional[str] = Field(default="default", alias="electiveGroup")
    semester_type: SemesterType = Field(default=SemesterType.ODD, alias="semesterType")
    department: Optional[str] = None

class GenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    semester_type: SemesterType = Field(alias="semesterType")
    semesters: List[int] = []

class ClashReport(BaseModel):
    faculty_clashes: List[dict] = []
    room_clashes: List[dict] = []
    elective_room_clashes: List[dict] = []
