import { signal, computed } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';

type ConnectionFactory = () => BaseTransport;

/**
 * Connection recovery configuration (ISSUE-020)
 */
export interface ConnectionRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<ConnectionRetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * ConnectionManager with automatic retry and recovery (ISSUE-020)
 *
 * Features:
 * - Exponential backoff retry on connection failure
 * - Proper cleanup of failed promises
 * - Observable error state for UI feedback
 * - Manual retry capability
 */
export class ConnectionManager {
  private readonly connectionSignal = signal<BaseTransport | undefined>(undefined);
  private currentPromise?: Promise<BaseTransport>;
  private readonly options: Required<ConnectionRetryOptions>;

  readonly state = computed(() => this.connectionSignal()?.state() ?? 'disconnected');
  readonly connection = computed(() => this.connectionSignal());

  /**
   * Connection error state for UI display (ISSUE-020)
   * Contains error message when connection fails, undefined when connected/connecting
   */
  readonly error = signal<string | undefined>(undefined);

  /**
   * Current retry attempt (0 = not retrying) (ISSUE-020)
   */
  readonly retryAttempt = signal<number>(0);

  constructor(
    private readonly factory: ConnectionFactory,
    options: ConnectionRetryOptions = {}
  ) {
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * Get or create connection with automatic retry (ISSUE-020)
   *
   * On failure:
   * - Clears currentPromise so subsequent calls can retry
   * - Retries with exponential backoff up to maxRetries
   * - Sets error signal for UI display
   */
  async get(): Promise<BaseTransport> {
    const current = this.connectionSignal();
    if (current) {
      return current;
    }

    if (this.currentPromise) {
      return this.currentPromise;
    }

    this.currentPromise = this.connectWithRetry();
    return this.currentPromise;
  }

  /**
   * Internal: Connect with exponential backoff retry (ISSUE-020)
   */
  private async connectWithRetry(): Promise<BaseTransport> {
    const { maxRetries, baseDelayMs, maxDelayMs } = this.options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.retryAttempt(attempt > 1 ? attempt : 0);
        this.error(undefined);

        const connection = await Promise.resolve(this.factory());
        this.connectionSignal(connection);
        this.retryAttempt(0);
        return connection;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[ConnectionManager] Attempt ${attempt}/${maxRetries} failed:`, errorMessage);

        // Clear promise so retry can start fresh
        this.currentPromise = undefined;

        if (attempt === maxRetries) {
          this.error(`Connection failed after ${maxRetries} attempts: ${errorMessage}`);
          this.retryAttempt(0);
          throw new Error(`Connection failed after ${maxRetries} attempts: ${errorMessage}`);
        }

        // Exponential backoff: 1s, 2s, 4s... capped at maxDelayMs
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        this.error(`Connection attempt ${attempt} failed. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('Connection failed');
  }

  /**
   * Manual retry after all automatic retries exhausted (ISSUE-020)
   */
  async retry(): Promise<BaseTransport> {
    // Clear any existing state
    this.currentPromise = undefined;
    this.error(undefined);
    this.retryAttempt(0);

    return this.get();
  }

  async open(): Promise<BaseTransport> {
    return this.get();
  }

  close(): void {
    const current = this.connectionSignal();
    if (current) {
      current.close();
      this.connectionSignal(undefined);
    }
    this.currentPromise = undefined;
    this.error(undefined);
    this.retryAttempt(0);
  }
}
