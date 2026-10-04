export function nextLocalEntityId(): number {
  return Date.now() + Math.floor(Math.random() * 10000);
}

export function nextOpId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
