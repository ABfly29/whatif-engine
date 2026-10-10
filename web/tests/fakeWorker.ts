/** Minimal stand-in for the engine Web Worker, driven manually by tests. */
export class FakeWorker {
  static instances: FakeWorker[] = [];
  static last = () => FakeWorker.instances.at(-1)!;

  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: { id: number; kind: string; payload: string }[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(m: { id: number; kind: string; payload: string }) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}
