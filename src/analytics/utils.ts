const warned = new Set<string>();

export function warnOnce(key: string, message: string): void {
  if (typeof console === 'undefined') return;
  if (warned.has(key)) return;

  warned.add(key);

  console.warn(`[analytics] ${message}`);
}

export function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}
