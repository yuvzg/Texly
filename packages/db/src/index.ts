export interface DatabaseHealth {
  connected: boolean;
  latencyMs?: number;
}

export function checkDbHealth(): DatabaseHealth {
  return { connected: true, latencyMs: 0 };
}
