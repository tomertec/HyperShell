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
  OPT_TERMINAL_TYPE: 0x18,
  TERMINAL_TYPE_IS: 0x00,
  TERMINAL_TYPE_SEND: 0x01,
} as const;

type State = "data" | "iac" | "will" | "wont" | "do" | "dont" | "sb" | "sb_data" | "sb_iac";

type EventMap = {
  data: (buf: Buffer) => void;
  send: (buf: Buffer) => void;
};

export class TelnetParser {
  private state: State = "data";
  private cols: number;
  private rows: number;
  private terminalType: string;
  private nawsNegotiated = false;
  private terminalTypeNegotiated = false;
  private sbOption: number | null = null;
  private sbData: number[] = [];
  private listeners: { data: Array<(buf: Buffer) => void>; send: Array<(buf: Buffer) => void> } = {
    data: [],
    send: [],
  };

  constructor(opts?: { cols?: number; rows?: number; terminalType?: string }) {
    this.cols = opts?.cols ?? 80;
    this.rows = opts?.rows ?? 24;
    this.terminalType = opts?.terminalType?.trim() || "xterm-256color";
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
          // First byte after SB is the option identifier.
          this.sbOption = byte;
          this.sbData = [];
          this.state = "sb_data";
          break;

        case "sb_data":
          if (byte === TELNET.IAC) {
            this.state = "sb_iac";
          } else {
            this.sbData.push(byte);
          }
          break;

        case "sb_iac":
          if (byte === TELNET.SE) {
            this.handleSubnegotiation(this.sbOption, this.sbData);
            this.sbOption = null;
            this.sbData = [];
            this.state = "data";
          } else if (byte === TELNET.IAC) {
            this.sbData.push(TELNET.IAC);
            this.state = "sb_data";
          } else {
            // IAC IAC inside subneg (escaped 0xFF) or unexpected byte — stay in subneg
            this.state = "sb_data";
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
      case TELNET.OPT_TERMINAL_TYPE:
        this.terminalTypeNegotiated = true;
        this.emit("send", Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.OPT_TERMINAL_TYPE]));
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

  private handleSubnegotiation(option: number | null, data: number[]): void {
    if (option === null) {
      return;
    }
    if (!this.terminalTypeNegotiated) {
      return;
    }
    if (option !== TELNET.OPT_TERMINAL_TYPE) {
      return;
    }
    if (data.length === 0 || data[0] !== TELNET.TERMINAL_TYPE_SEND) {
      return;
    }

    this.emit(
      "send",
      Buffer.concat([
        Buffer.from([
          TELNET.IAC,
          TELNET.SB,
          TELNET.OPT_TERMINAL_TYPE,
          TELNET.TERMINAL_TYPE_IS,
        ]),
        Buffer.from(this.terminalType, "ascii"),
        Buffer.from([TELNET.IAC, TELNET.SE]),
      ])
    );
  }
}
