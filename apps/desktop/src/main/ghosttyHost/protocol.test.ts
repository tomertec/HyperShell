import { describe, expect, test } from "vitest";
import { encodeFrame, FrameDecoder, FrameType } from "./protocol";

const GOLDEN = Buffer.from("030000000702000000" + "6c730a", "hex");

describe("ghostty frame codec", () => {
  test("encodeFrame produces the golden feedData frame", () => {
    expect(encodeFrame(FrameType.feedData, 2, "ls\n").equals(GOLDEN)).toBe(true);
  });

  test("decoder yields the golden frame whole", () => {
    const frames = new FrameDecoder().push(GOLDEN);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ type: FrameType.feedData, surfaceId: 2 });
    expect(frames[0]!.payload.toString()).toBe("ls\n");
  });

  test("decoder reassembles a frame split at every byte boundary", () => {
    for (let split = 1; split < GOLDEN.length; split++) {
      const d = new FrameDecoder();
      expect(d.push(GOLDEN.subarray(0, split))).toHaveLength(0);
      const frames = d.push(GOLDEN.subarray(split));
      expect(frames).toHaveLength(1);
      expect(frames[0]!.payload.toString()).toBe("ls\n");
    }
  });

  test("decoder yields multiple frames from one chunk", () => {
    const two = Buffer.concat([GOLDEN, encodeFrame(FrameType.bell, 9, "{}")]);
    const frames = new FrameDecoder().push(two);
    expect(frames.map((f) => f.type)).toEqual([FrameType.feedData, FrameType.bell]);
  });

  test("decoder throws on unknown frame type", () => {
    const bad = Buffer.from("000000007e00000000", "hex");
    expect(() => new FrameDecoder().push(bad)).toThrow(/unknown frame type/i);
  });
});
