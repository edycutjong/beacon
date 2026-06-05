// ── Audit Log ────────────────────────────────────────────────────────────────
// Records on-device model lifecycle + inference metrics (loads/unloads, TTFT,
// tokens/sec). Pure, in-memory, offline — never leaves the device. This is the
// transparency layer that lets a field operator (or a judge) see exactly what
// the QVAC runtime is doing and how fast.

export type AuditEventType = "model_load" | "model_unload" | "completion";

export interface AuditEvent {
  type: AuditEventType;
  /** Model identifier returned by loadModel(), or the requested source. */
  modelId: string;
  /** QVAC modelType (e.g. "llamacpp-completion", "embeddings", "tts"). */
  modelType?: string;
  /** Epoch milliseconds when the event was recorded. */
  timestamp: number;
  /** model_load: wall time to load the model into memory (ms). */
  loadMs?: number;
  /** completion: time to first token (ms). For non-streamed calls this equals
   *  totalMs and `streamed` is false — see that flag before trusting TTFT. */
  ttftMs?: number;
  /** completion: total wall time for the call (ms). */
  totalMs?: number;
  /** completion: number of output tokens (estimated when no tokenizer). */
  tokenCount?: number;
  /** completion: tokens / second over totalMs. */
  tokensPerSec?: number;
  /** completion: true if measured from a real token stream (accurate TTFT). */
  streamed?: boolean;
  /** completion: routing source, when known ("local" | "delegated"). */
  source?: string;
}

const MAX_EVENTS = 500;
const events: AuditEvent[] = [];

/** Sink invoked for every recorded event. Defaults to a console logger; swap it
 *  out (e.g. to push into React state) via setAuditSink(). */
let sink: ((event: AuditEvent) => void) | null = consoleSink;

function consoleSink(e: AuditEvent): void {
  if (e.type === "model_load") {
    console.log(`[audit] load   ${e.modelType ?? "?"} (${e.modelId}) in ${e.loadMs}ms`);
  } else if (e.type === "model_unload") {
    console.log(`[audit] unload ${e.modelId}`);
  } else {
    const ttft = e.streamed ? `${e.ttftMs}ms TTFT` : `${e.totalMs}ms (non-stream)`;
    console.log(
      `[audit] infer  ${e.source ?? "local"} · ${ttft} · ${e.tokenCount} tok · ${e.tokensPerSec?.toFixed(1)} tok/s`
    );
  }
}

export function setAuditSink(fn: ((event: AuditEvent) => void) | null): void {
  sink = fn;
}

function push(event: AuditEvent): AuditEvent {
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  try {
    sink?.(event);
  } catch {
    // A misbehaving sink must never break inference.
  }
  return event;
}

/** Rough token estimate when the runtime doesn't return a token count.
 *  ~4 chars/token is the common heuristic for English. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function recordModelLoad(modelId: string, modelType: string | undefined, loadMs: number): AuditEvent {
  return push({ type: "model_load", modelId, modelType, loadMs, timestamp: Date.now() });
}

export function recordModelUnload(modelId: string): AuditEvent {
  return push({ type: "model_unload", modelId, timestamp: Date.now() });
}

export function recordCompletion(params: {
  modelId: string;
  totalMs: number;
  tokenCount: number;
  ttftMs?: number;
  streamed?: boolean;
  source?: string;
}): AuditEvent {
  const tokensPerSec = params.totalMs > 0 ? params.tokenCount / (params.totalMs / 1000) : 0;
  return push({
    type: "completion",
    modelId: params.modelId,
    timestamp: Date.now(),
    totalMs: params.totalMs,
    ttftMs: params.ttftMs ?? params.totalMs,
    tokenCount: params.tokenCount,
    tokensPerSec,
    streamed: params.streamed ?? false,
    source: params.source,
  });
}

export function getAuditLog(): readonly AuditEvent[] {
  return events;
}

export function clearAuditLog(): void {
  events.length = 0;
}

export interface AuditSummary {
  totalEvents: number;
  loads: number;
  unloads: number;
  completions: number;
  /** Models currently held in memory (loads minus unloads, by modelId). */
  activeModels: string[];
  avgTtftMs: number | null;
  avgTokensPerSec: number | null;
}

export function getAuditSummary(): AuditSummary {
  const completions = events.filter((e) => e.type === "completion");
  const ttfts = completions.map((e) => e.ttftMs ?? 0).filter((n) => n > 0);
  const tps = completions.map((e) => e.tokensPerSec ?? 0).filter((n) => n > 0);

  const active = new Map<string, number>();
  for (const e of events) {
    if (e.type === "model_load") active.set(e.modelId, (active.get(e.modelId) ?? 0) + 1);
    if (e.type === "model_unload") active.set(e.modelId, (active.get(e.modelId) ?? 0) - 1);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return {
    totalEvents: events.length,
    loads: events.filter((e) => e.type === "model_load").length,
    unloads: events.filter((e) => e.type === "model_unload").length,
    completions: completions.length,
    activeModels: [...active.entries()].filter(([, n]) => n > 0).map(([id]) => id),
    avgTtftMs: avg(ttfts),
    avgTokensPerSec: avg(tps),
  };
}
