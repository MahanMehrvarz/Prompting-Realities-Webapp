// Thread label format matches Excel export tab names (DD-MM-YYYY HH-mm in UTC).
// Server formats UTC-naive timestamps; mirror that here so the same string
// appears in the UI and the workbook tab — researchers can cross-reference.
export function threadLabel(iso: string | null | undefined): string {
  if (!iso) return "Thread";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Thread";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
}
