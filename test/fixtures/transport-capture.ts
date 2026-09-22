export interface TransportMessage {
  role: "system" | "user";
  content: string;
}

export interface TransportPayload {
  messages: readonly TransportMessage[];
}

export function createTransportCapture(): {
  observe(payload: TransportPayload): void;
  read(): TransportPayload;
} {
  let capturedPayload: TransportPayload | undefined;

  return {
    observe(payload) {
      capturedPayload = payload;
    },
    read() {
      if (!capturedPayload) {
        throw new Error("The simulated transport did not observe a payload");
      }
      return capturedPayload;
    },
  };
}
