import { mkdirSync, createWriteStream, statSync } from "node:fs";
import type { WriteStream } from "node:fs";
import path from "node:path";

export type AsciinemaEventType = "o";

export type AsciinemaHeader = {
  version: 2;
  width: number;
  height: number;
  timestamp: number;
  title?: string;
};

export type AsciinemaFrame = [number, AsciinemaEventType, string];

export interface AsciinemaWriterOptions {
  filePath: string;
  width: number;
  height: number;
  title?: string;
  startedAtMs?: number;
}

export interface AsciinemaFinalizeResult {
  endedAt: string;
  durationMs: number;
  fileSizeBytes: number;
  eventCount: number;
}

function normalizeTimestampSeconds(valueMs: number): number {
  return Math.max(0, Math.round((valueMs / 1000) * 1_000_000) / 1_000_000);
}

function writeLine(stream: WriteStream, value: unknown): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

export class AsciinemaWriter {
  readonly filePath: string;
  readonly header: AsciinemaHeader;

  private readonly startedAtMs: number;
  private readonly stream: WriteStream;
  private closed = false;
  private eventCount = 0;

  constructor(options: AsciinemaWriterOptions) {
    this.filePath = path.resolve(options.filePath);
    this.startedAtMs = options.startedAtMs ?? Date.now();

    mkdirSync(path.dirname(this.filePath), { recursive: true });

    this.header = {
      version: 2,
      width: options.width,
      height: options.height,
      timestamp: Math.floor(this.startedAtMs / 1000),
      ...(options.title ? { title: options.title } : {}),
    };

    this.stream = createWriteStream(this.filePath, { flags: "w", encoding: "utf-8" });
    writeLine(this.stream, this.header);
  }

  appendOutput(data: string, nowMs: number = Date.now()): void {
    if (this.closed || data.length === 0) {
      return;
    }

    const relSeconds = normalizeTimestampSeconds(nowMs - this.startedAtMs);
    const frame: AsciinemaFrame = [relSeconds, "o", data];
    writeLine(this.stream, frame);
    this.eventCount += 1;
  }

  async finalize(endedAtMs: number = Date.now()): Promise<AsciinemaFinalizeResult> {
    if (!this.closed) {
      this.closed = true;
      await new Promise<void>((resolve, reject) => {
        this.stream.once("finish", resolve);
        this.stream.once("error", reject);
        this.stream.end();
      });
    }

    const durationMs = Math.max(0, Math.round(endedAtMs - this.startedAtMs));
    const fileSizeBytes = statSync(this.filePath).size;

    return {
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs,
      fileSizeBytes,
      eventCount: this.eventCount,
    };
  }
}
