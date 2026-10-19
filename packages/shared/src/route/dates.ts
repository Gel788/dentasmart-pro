/** Lab work must be back this many working days before the visit that needs it. */
export function labDueAt(visitStartsAt: Date, workdays = 2): Date {
  const due = new Date(visitStartsAt.getTime());
  let left = workdays;
  while (left > 0) {
    due.setUTCDate(due.getUTCDate() - 1);
    const day = due.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return due;
}
