export const TELNET = {
  IAC: 0xff,
  DONT: 0xfe,
  DO: 0xfd,
  WONT: 0xfc,
  WILL: 0xfb,
  SB: 0xfa,
  SE: 0xf0,
  OPT_ECHO: 0x01,
  OPT_SGA: 0x03,
  OPT_NAWS: 0x1f,
} as const;

type State = "data" | "iac" | "will" | "wont" | "do" | "dont" | "sb" | "sb_data";

type EventMap = {
  data: (buf: Buffer) => void;
  send: (buf: Buffer) => void;
};

export class TelnetParser {
  private state: State = "data";
  private cols: number;
  private rows: number;
  private nawsNegotiated = false;
  private listeners: { data: Array<(buf: Buffer) => void>; send: Array<(buf: Buffer) => void> } = {
    data: [],
    send: [],
  };

  constructor(opts?: { cols?: number; rows?: number }) {
    this.cols = opts?.cols ?? 80;
    this.rows = opts?.rows ?? 24;
  }

  on<K extends keyof EventMap>(event: K, listener: EventMap[K]): void {
    this.listeners[event].push(listener);
  }

  private emit<K extends keyof EventMap>(event: K, buf: Buffer): void {
    for (const fn of this.listeners[event]) {
      fn(buf);
    }
  }

  feed(buf: Buffer): void {
    const dataChunks: number[] = [];

    const flushData = () => {
      if (dataChunks.length > 0) {
        this.emit("data", Buffer.from(dataChunks));
        dataChunks.length = 0;
      }
    };

    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];

      switch (this.state) {
        case "data":
          if (byte === TELNET.IAC) {
            this.state = "iac";
          } else {
            dataChunks.push(byte);
          }
          break;

        case "iac":
          switch (byte) {
            case TELNET.IAC:
              dataChunks.push(0xff);
              this.state = "data";
              break;
            case TELNET.WILL:
              this.state = "will";
              break;
            case TELNET.WONT:
              this.state = "wont";
              break;
            case TELNET.DO:
              this.state = "do";
              break;
            case TELNET.DONT:
              this.state = "dont";
              break;
            case TELNET.SB:
              this.state = "sb";
              break;
            default:
              this.state = "data";
              break;
          }
          break;

        case "will":
          flushData();
          this.handleWill(byte);
          this.state = "data";
          break;

        case "wont":
          // Ignore WONT
          this.state = "data";
          break;

        case "do":
          flushData();
          this.handleDo(byte);
          this.state = "data";
          break;

        case "dont":
          // Ignore DONT
          this.state = "data";
          break;

        case "sb":
          // First byte after SB is the option; move to sb_data to consume until IAC SE
          this.state = "sb_data";
          break;

        case "sb_data":
          if (byte === TELNET.IAC) {
            // Peek: next byte should be SE
            // But we handle it by transitioning — next byte in iac state will handle SE
            // Actually, within SB data, IAC IAC means literal 0xFF, IAC SE means end.
            // We need a sub-state. Let's handle inline:
            const next = buf[i + 1];
            if (next === TELNET.SE) {
              i++; // skip SE
              this.state = "data";
            } else if (next === TELNET.IAC) {
              i++; // skip escaped IAC within sub-negotiation (ignore it)
            }
            // If next byte isn't available (split), we stay in sb_data.
            // Edge case: IAC at end of buffer with no next byte — we handle by
            // staying in sb_data and the next feed will provide SE.
            if (next === undefined) {
              // We'll need to remember we saw IAC in subneg.
              // Use a simple approach: transition to a temporary state.
              // For simplicity, store a flag. Actually let's just re-enter iac
              // but that would break subneg. Let's handle it properly:
              this.state = "sb_iac" as State;
            }
          }
          // Otherwise just skip the subneg data byte
          break;

        default:
          // Handle "sb_iac" state for split IAC in subnegotiation
          if ((this.state as string) === "sb_iac") {
            if (byte === TELNET.SE) {
              this.state = "data";
            } else if (byte === TELNET.IAC) {
              // Escaped IAC in subneg, ignore
              this.state = "sb_data";
            } else {
              this.state = "sb_data";
            }
          }
          break;
      }
    }

    flushData();
  }

  private handleWill(option: number): void {
    switch (option) {
      case TELNET.OPT_SGA:
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_SGA]));
        break;
      case TELNET.OPT_ECHO:
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_ECHO]));
        break;
      default:
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.DONT, option]));
        break;
    }
  }

  private handleDo(option: number): void {
    switch (option) {
      case TELNET.OPT_NAWS:
        this.nawsNegotiated = true;
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.OPT_NAWS]));
        this.emitNaws(this.cols, this.rows);
        break;
      case TELNET.OPT_SGA:
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.OPT_SGA]));
        break;
      default:
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.WONT, option]));
        break;
    }
  }

  sendNaws(cols: number, rows: number): void {
    if (!this.nawsNegotiated) return;
    this.cols = cols;
    this.rows = rows;
    this.emitNaws(cols, rows);
  }

  private emitNaws(cols: number, rows: number): void {
    this.emit(
      "send",
      Buffer.from([
        TELNET.IAC,
        TELNET.SB,
        TELNET.OPT_NAWS,
        (cols >> 8) & 0xff,
        cols & 0xff,
        (rows >> 8) & 0xff,
        rows & 0xff,
        TELNET.IAC,
        TELNET.SE,
      ])
    );
  }
}
