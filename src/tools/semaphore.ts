export class Semaphore {
  private capacity: number;
  private current: number;
  private queue: Array<() => void>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.current = 0;
    this.queue = [];
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.current < this.capacity) {
        this.current++;
        resolve();
      } else {
        this.queue.push(() => {
          this.current++;
          resolve();
        });
      }
    });
  }

  async release(): Promise<void> {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}