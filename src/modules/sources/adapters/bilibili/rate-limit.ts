/**
 * MinIntervalGate — serialize async calls so they start at least
 * `minIntervalMs` apart. Used to stay under bilibili's risk-control radar.
 *
 * Implementation: a promise chain. Each `wait()` appends to the chain, so
 * callers are served FIFO and concurrent callers can never burst.
 */
export class MinIntervalGate {
  private chain: Promise<void> = Promise.resolve();
  private lastStart = 0;

  constructor(private readonly minIntervalMs: number) {}

  wait(): Promise<void> {
    const run = async (): Promise<void> => {
      const now = Date.now();
      const waitMs = this.lastStart + this.minIntervalMs - now;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastStart = Date.now();
    };
    const next = this.chain.then(run);
    // keep the chain alive even if a consumer's continuation throws
    this.chain = next.catch(() => {});
    return next;
  }
}
