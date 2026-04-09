export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getState(): CircuitState {
    if (this.state === 'open' && this.cooldownElapsed()) {
      this.state = 'half_open';
    }
    return this.state;
  }

  isOpen(): boolean {
    const current = this.getState();
    return current === 'open';
  }

  onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }

  private cooldownElapsed(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.cooldownMs;
  }
}
