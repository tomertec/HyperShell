import { readFileSync } from "node:fs";
import path from "node:path";

import type { AsciinemaFrame, AsciinemaHeader } from "./asciinemaWriter";

export interface AsciinemaRecording {
  header: AsciinemaHeader;
  frames: AsciinemaFrame[];
}

function isAsciinemaHeader(value: unknown): value is AsciinemaHeader {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<AsciinemaHeader>;
  return (
    candidate.version === 2 &&
    typeof candidate.width === "number" &&
    Number.isFinite(candidate.width) &&
    candidate.width > 0 &&
    typeof candidate.height === "number" &&
    Number.isFinite(candidate.height) &&
    candidate.height > 0 &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp)
  );
}

function parseFrame(value: unknown, lineNumber: number): AsciinemaFrame {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Invalid frame at line ${lineNumber}`);
  }

  const [time, eventType, data] = value;
  if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
    throw new Error(`Invalid frame time at line ${lineNumber}`);
  }
  if (eventType !== "o") {
    throw new Error(`Unsupported frame type at line ${lineNumber}: ${String(eventType)}`);
  }
  if (typeof data !== "string") {
    throw new Error(`Invalid frame data at line ${lineNumber}`);
  }

  return [time, eventType, data];
}

export function parseAsciinemaCast(content: string): AsciinemaRecording {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Empty cast file");
  }

  const parsedHeader = JSON.parse(lines[0]);
  if (!isAsciinemaHeader(parsedHeader)) {
    throw new Error("Invalid ASCIINEMA header");
  }

  const frames: AsciinemaFrame[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parsed = JSON.parse(lines[i]);
    frames.push(parseFrame(parsed, i + 1));
  }

  return {
    header: parsedHeader,
    frames,
  };
}

export function readAsciinemaCast(filePath: string): AsciinemaRecording {
  const resolved = path.resolve(filePath);
  const content = readFileSync(resolved, "utf-8");
  return parseAsciinemaCast(content);
}
