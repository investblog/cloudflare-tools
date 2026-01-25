/**
 * Rate-Limited Request Queue
 *
 * Provides per-operation request pools with:
 * - Concurrency limiting
 * - Exponential backoff with jitter
 * - Retry-After header respect
 * - Pause/Resume/Cancel functionality
 */

import { isCFClientError } from './cf-client';

// ============================================================================
// Types
// ============================================================================

export interface QueueConfig {
  maxConcurrency: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export interface PoolStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  paused: boolean;
}

interface QueuedTask<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  attempt: number;
  createdAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrency: 4,
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 20000,
  jitterFactor: 0.3,
};

// ============================================================================
// Request Pool Class
// ============================================================================

export class RequestPool {
  private config: QueueConfig;
  private queue: QueuedTask<unknown>[] = [];
  private running = 0;
  private completed = 0;
  private failed = 0;
  private paused = false;
  private taskCounter = 0;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // Apply caps
      maxConcurrency: Math.min(config.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency, 8),
      maxRetries: Math.min(config.maxRetries ?? DEFAULT_CONFIG.maxRetries, 5),
    };
  }

  /**
   * Add a task to the queue. Returns a promise that resolves when the task completes.
   */
  add<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: `task-${++this.taskCounter}`,
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
        attempt: 0,
        createdAt: Date.now(),
      };

      this.queue.push(task as QueuedTask<unknown>);
      this.processQueue();
    });
  }

  /**
   * Pause processing. Running tasks will complete, but no new tasks will start.
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume processing after pause.
   */
  resume(): void {
    this.paused = false;
    this.processQueue();
  }

  /**
   * Clear all pending tasks. Running tasks will complete.
   */
  clear(): void {
    for (const task of this.queue) {
      task.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  /**
   * Get current pool statistics.
   */
  getStats(): PoolStats {
    return {
      pending: this.queue.length,
      running: this.running,
      completed: this.completed,
      failed: this.failed,
      paused: this.paused,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      maxConcurrency: Math.min(config.maxConcurrency ?? this.config.maxConcurrency, 8),
      maxRetries: Math.min(config.maxRetries ?? this.config.maxRetries, 5),
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.completed = 0;
    this.failed = 0;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Process pending tasks up to concurrency limit.
   */
  private processQueue(): void {
    if (this.paused) return;

    while (this.running < this.config.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.executeTask(task);
    }
  }

  /**
   * Execute a single task with retry logic.
   */
  private async executeTask(task: QueuedTask<unknown>): Promise<void> {
    this.running++;

    try {
      const result = await task.execute();
      this.completed++;
      task.resolve(result);
    } catch (error) {
      const shouldRetry = this.shouldRetry(error, task.attempt);

      if (shouldRetry && task.attempt < this.config.maxRetries) {
        // Schedule retry
        task.attempt++;
        const delay = this.calculateDelay(error, task.attempt);

        setTimeout(() => {
          this.queue.unshift(task); // Add to front of queue
          this.processQueue();
        }, delay);
      } else {
        // Max retries exceeded or non-retryable error
        this.failed++;
        task.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  /**
   * Determine if an error should trigger a retry.
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    if (isCFClientError(error)) {
      return error.normalized.retryable;
    }

    // Network errors are retryable
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay before retry using exponential backoff with jitter.
   */
  private calculateDelay(error: unknown, attempt: number): number {
    // Check for Retry-After header
    if (isCFClientError(error) && error.retryAfterMs) {
      return error.retryAfterMs;
    }

    // Exponential backoff: min(maxDelay, baseDelay * 2^attempt)
    const exponentialDelay = Math.min(
      this.config.maxDelayMs,
      this.config.baseDelayMs * Math.pow(2, attempt)
    );

    // Add jitter: random fraction of baseDelay
    const jitter = Math.random() * this.config.baseDelayMs * this.config.jitterFactor;

    return Math.floor(exponentialDelay + jitter);
  }
}

// ============================================================================
// Pre-configured Pools
// ============================================================================

/**
 * Pool for zone creation operations.
 */
export const createPool = new RequestPool({
  maxConcurrency: 4,
  maxRetries: 3,
});

/**
 * Pool for zone deletion operations.
 */
export const deletePool = new RequestPool({
  maxConcurrency: 4,
  maxRetries: 3,
});

/**
 * Pool for cache purge operations.
 */
export const purgePool = new RequestPool({
  maxConcurrency: 4,
  maxRetries: 3,
});

/**
 * Pool for preflight checks (zone existence).
 * Higher concurrency since these are read-only.
 */
export const preflightPool = new RequestPool({
  maxConcurrency: 6,
  maxRetries: 2,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Pause all pools.
 */
export function pauseAllPools(): void {
  createPool.pause();
  deletePool.pause();
  purgePool.pause();
  preflightPool.pause();
}

/**
 * Resume all pools.
 */
export function resumeAllPools(): void {
  createPool.resume();
  deletePool.resume();
  purgePool.resume();
  preflightPool.resume();
}

/**
 * Clear all pools.
 */
export function clearAllPools(): void {
  createPool.clear();
  deletePool.clear();
  purgePool.clear();
  preflightPool.clear();
}

/**
 * Update concurrency for all pools.
 */
export function updatePoolConcurrency(maxConcurrency: number): void {
  const config = { maxConcurrency };
  createPool.updateConfig(config);
  deletePool.updateConfig(config);
  purgePool.updateConfig(config);
  preflightPool.updateConfig({ maxConcurrency: Math.min(maxConcurrency + 2, 8) });
}
