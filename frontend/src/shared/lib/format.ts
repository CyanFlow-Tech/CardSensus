export function formatHours(hours: number): string {
  return `${hours.toFixed(0)}h`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function toTitleCase(value: string): string {
  return value.replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

