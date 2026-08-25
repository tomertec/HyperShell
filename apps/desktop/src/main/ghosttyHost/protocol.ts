export const FrameType = {
  hello: 0x01,
  createSurface: 0x02,
  destroySurface: 0x03,
  setBounds: 0x04,
  setVisible: 0x05,
  focus: 0x06,
  feedData: 0x07,
  sessionClosed: 0x08,
  updateConfig: 0x09,
  command: 0x0a,
  replayFile: 0x0b,
  input: 0x14,
  gridSize: 0x15,
  title: 0x16,
  bell: 0x17,
  passthroughChord: 0x18,
  focusGained: 0x19,
  focusLost: 0x1a,
  surfaceCrashed: 0x1b,
} as const;

const KNOWN_FRAME_TYPES = new Set<number>(Object.values(FrameType));

export const PROTOCOL_VERSION = 1;

const HEADER_LENGTH = 9;
const MAX_PAYLOAD_LENGTH = 1024 * 1024;

export type Frame = {
  type: number;
  surfaceId: number;
  payload: Buffer;
};

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function encodeFrame(type: number, surfaceId: number, payload: Buffer | string): Buffer {
  const payloadBuffer = typeof payload === "string" ? Buffer.from(payload) : payload;
  const frame = Buffer.allocUnsafe(HEADER_LENGTH + payloadBuffer.length);
  frame.writeUInt32LE(payloadBuffer.length, 0);
  frame.writeUInt8(type, 4);
  frame.writeUInt32LE(surfaceId, 5);
  payloadBuffer.copy(frame, HEADER_LENGTH);
  return frame;
}

export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Frame[] {
    this.buffer = this.buffer.length > 0 ? Buffer.concat([this.buffer, chunk]) : chunk;

    const frames: Frame[] = [];
    while (this.buffer.length >= HEADER_LENGTH) {
      const payloadLength = this.buffer.readUInt32LE(0);
      if (payloadLength > MAX_PAYLOAD_LENGTH) {
        throw new ProtocolError(`payload too large: ${payloadLength} bytes exceeds 1 MiB limit`);
      }

      const totalLength = HEADER_LENGTH + payloadLength;
      if (this.buffer.length < totalLength) {
        break;
      }

      const type = this.buffer.readUInt8(4);
      if (!KNOWN_FRAME_TYPES.has(type)) {
        throw new ProtocolError(`unknown frame type: 0x${type.toString(16)}`);
      }

      const surfaceId = this.buffer.readUInt32LE(5);
      const payload = Buffer.from(this.buffer.subarray(HEADER_LENGTH, totalLength));
      frames.push({ type, surfaceId, payload });

      this.buffer = this.buffer.subarray(totalLength);
    }

    return frames;
  }
}
