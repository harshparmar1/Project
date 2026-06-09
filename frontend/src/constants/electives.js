export const isElectiveSubject = (sub) =>
  sub?.isElective || sub?.type === 'Elective';
