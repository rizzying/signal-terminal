// Token bucket: stays under Bulk's 5 req/s public limit (we use 4/s, burst 20).
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  private queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private rate = 4, private burst = 20, private now = () => Date.now()) {
    this.tokens = burst;
    this.last = now();
  }
  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
  }
  take(): Promise<void> {
    return new Promise((res) => { this.queue.push(res); this.pump(); });
  }
  private pump() {
    this.refill();
    while (this.queue.length && this.tokens >= 1) { this.tokens -= 1; this.queue.shift()!(); }
    if (this.queue.length && !this.timer) {
      const wait = Math.ceil(((1 - this.tokens) / this.rate) * 1000);
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, wait);
    }
  }
}
