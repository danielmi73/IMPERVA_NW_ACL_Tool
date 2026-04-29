/**
 * Date formatting utilities — always render in the client's local timezone.
 * The browser's Intl API automatically picks up the system timezone.
 */

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Full date + time: "26 Apr 2026, 20:47:12" */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return dateTimeFmt.format(new Date(value));
  } catch {
    return value;
  }
}

/** Date only: "26 Apr 2026" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return dateFmt.format(new Date(value));
  } catch {
    return value;
  }
}

/** Time only: "20:47:12" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return timeFmt.format(new Date(value));
  } catch {
    return value;
  }
}
