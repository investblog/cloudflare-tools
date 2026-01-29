/**
 * Task Ledger - IndexedDB Persistence
 *
 * Stores batch operations and individual tasks for:
 * - Progress tracking
 * - Resume after browser restart
 * - Retry failed operations
 * - Export results
 */

import type {
  TaskOperation,
  TaskStatus,
  TaskEntry,
  BatchInfo,
  BatchSummary,
} from '../shared/types/tasks';

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'cf-tools-ledger';
const DB_VERSION = 1;

const STORE_BATCHES = 'batches';
const STORE_TASKS = 'tasks';

// ============================================================================
// Ledger Class
// ============================================================================

export class Ledger {
  private db: IDBDatabase | null = null;

  /**
   * Open database connection.
   */
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create batches store
        if (!db.objectStoreNames.contains(STORE_BATCHES)) {
          const batchStore = db.createObjectStore(STORE_BATCHES, { keyPath: 'id' });
          batchStore.createIndex('operation', 'operation', { unique: false });
          batchStore.createIndex('status', 'status', { unique: false });
          batchStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create tasks store
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          const taskStore = db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
          taskStore.createIndex('batchId', 'batchId', { unique: false });
          taskStore.createIndex('status', 'status', { unique: false });
          taskStore.createIndex('domain', 'domain', { unique: false });
          taskStore.createIndex('batchId_status', ['batchId', 'status'], { unique: false });
        }
      };
    });
  }

  /**
   * Close database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Create a new batch with tasks for given domains or zones.
   * @param items - domains (strings) for create, or zones ({id, name}) for delete/purge
   */
  async createBatch(
    operation: TaskOperation,
    accountId: string,
    items: string[] | Array<{ id: string; name: string }>,
    options?: { type?: 'full' | 'partial'; jumpStart?: boolean }
  ): Promise<string> {
    this.ensureOpen();

    const batchId = crypto.randomUUID();
    const now = Date.now();

    const batch: BatchInfo = {
      id: batchId,
      operation,
      accountId,
      options,
      totalCount: items.length,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const tasks: TaskEntry[] = items.map((item) => {
      // Check if item is a zone object (has id and name) or a string
      if (typeof item === 'object' && 'id' in item && 'name' in item) {
        return {
          id: crypto.randomUUID(),
          batchId,
          domain: item.id,      // zoneId for API calls
          zoneName: item.name,  // zone name for display
          operation,
          status: 'queued' as TaskStatus,
          attempt: 0,
          createdAt: now,
          updatedAt: now,
        };
      }
      // String item (domain for create, or legacy zoneId)
      return {
        id: crypto.randomUUID(),
        batchId,
        domain: item,
        operation,
        status: 'queued' as TaskStatus,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      };
    });

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_BATCHES, STORE_TASKS], 'readwrite');

      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error?.message}`));
      tx.oncomplete = () => resolve(batchId);

      const batchStore = tx.objectStore(STORE_BATCHES);
      const taskStore = tx.objectStore(STORE_TASKS);

      batchStore.add(batch);
      for (const task of tasks) {
        taskStore.add(task);
      }
    });
  }

  /**
   * Get batch by ID.
   */
  async getBatch(batchId: string): Promise<BatchInfo | null> {
    this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_BATCHES, 'readonly');
      const store = tx.objectStore(STORE_BATCHES);
      const request = store.get(batchId);

      request.onerror = () => reject(new Error(`Failed to get batch: ${request.error?.message}`));
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Update batch.
   */
  async updateBatch(batchId: string, updates: Partial<BatchInfo>): Promise<void> {
    this.ensureOpen();

    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const updated: BatchInfo = {
      ...batch,
      ...updates,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_BATCHES, 'readwrite');
      const store = tx.objectStore(STORE_BATCHES);
      const request = store.put(updated);

      request.onerror = () => reject(new Error(`Failed to update batch: ${request.error?.message}`));
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get all incomplete batches (for resume).
   */
  async getIncompleteBatches(): Promise<BatchInfo[]> {
    this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_BATCHES, 'readonly');
      const store = tx.objectStore(STORE_BATCHES);
      const request = store.getAll();

      request.onerror = () => reject(new Error(`Failed to get batches: ${request.error?.message}`));
      request.onsuccess = () => {
        const batches = request.result as BatchInfo[];
        const incomplete = batches.filter(
          (b) => b.status === 'running' || b.status === 'paused' || b.status === 'pending'
        );
        resolve(incomplete);
      };
    });
  }

  /**
   * Delete batch and all its tasks.
   */
  async deleteBatch(batchId: string): Promise<void> {
    this.ensureOpen();

    const tasks = await this.getTasksByBatch(batchId);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_BATCHES, STORE_TASKS], 'readwrite');

      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error?.message}`));
      tx.oncomplete = () => resolve();

      const batchStore = tx.objectStore(STORE_BATCHES);
      const taskStore = tx.objectStore(STORE_TASKS);

      batchStore.delete(batchId);
      for (const task of tasks) {
        taskStore.delete(task.id);
      }
    });
  }

  // ==========================================================================
  // Task Operations
  // ==========================================================================

  /**
   * Get task by ID.
   */
  async getTask(taskId: string): Promise<TaskEntry | null> {
    this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_TASKS, 'readonly');
      const store = tx.objectStore(STORE_TASKS);
      const request = store.get(taskId);

      request.onerror = () => reject(new Error(`Failed to get task: ${request.error?.message}`));
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Update task.
   */
  async updateTask(taskId: string, updates: Partial<TaskEntry>): Promise<void> {
    this.ensureOpen();

    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated: TaskEntry = {
      ...task,
      ...updates,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_TASKS, 'readwrite');
      const store = tx.objectStore(STORE_TASKS);
      const request = store.put(updated);

      request.onerror = () => reject(new Error(`Failed to update task: ${request.error?.message}`));
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get all tasks for a batch.
   */
  async getTasksByBatch(batchId: string): Promise<TaskEntry[]> {
    this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_TASKS, 'readonly');
      const store = tx.objectStore(STORE_TASKS);
      const index = store.index('batchId');
      const request = index.getAll(batchId);

      request.onerror = () => reject(new Error(`Failed to get tasks: ${request.error?.message}`));
      request.onsuccess = () => resolve(request.result as TaskEntry[]);
    });
  }

  /**
   * Get tasks by status for a batch.
   */
  async getTasksByStatus(batchId: string, status: TaskStatus): Promise<TaskEntry[]> {
    this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_TASKS, 'readonly');
      const store = tx.objectStore(STORE_TASKS);
      const index = store.index('batchId_status');
      const request = index.getAll([batchId, status]);

      request.onerror = () => reject(new Error(`Failed to get tasks: ${request.error?.message}`));
      request.onsuccess = () => resolve(request.result as TaskEntry[]);
    });
  }

  /**
   * Get queued tasks for a batch (ready to process).
   */
  async getQueuedTasks(batchId: string): Promise<TaskEntry[]> {
    return this.getTasksByStatus(batchId, 'queued');
  }

  /**
   * Get failed tasks for a batch (for retry).
   */
  async getFailedTasks(batchId: string): Promise<TaskEntry[]> {
    return this.getTasksByStatus(batchId, 'failed');
  }

  // ==========================================================================
  // Summary
  // ==========================================================================

  /**
   * Calculate batch summary.
   */
  async getBatchSummary(batchId: string): Promise<BatchSummary> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const tasks = await this.getTasksByBatch(batchId);

    const processed = tasks.filter((t) =>
      ['success', 'failed', 'skipped', 'blocked'].includes(t.status)
    ).length;

    const success = tasks.filter((t) => t.status === 'success').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const skipped = tasks.filter((t) => t.status === 'skipped').length;
    const blocked = tasks.filter((t) => t.status === 'blocked').length;

    // Calculate ETA using moving average of completed tasks
    const completedTasks = tasks
      .filter((t) => t.latencyMs !== undefined && t.status !== 'queued' && t.status !== 'running')
      .slice(-30);

    let etaMs: number | null = null;
    if (completedTasks.length > 0) {
      const avgLatency =
        completedTasks.reduce((sum, t) => sum + (t.latencyMs || 0), 0) / completedTasks.length;
      const remaining = batch.totalCount - processed;
      etaMs = Math.round(avgLatency * remaining);
    }

    return {
      processed,
      total: batch.totalCount,
      success,
      failed,
      skipped,
      blocked,
      etaMs,
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Delete old completed batches.
   */
  async clearOldBatches(olderThanMs: number): Promise<number> {
    this.ensureOpen();

    const cutoff = Date.now() - olderThanMs;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_BATCHES, 'readonly');
      const store = tx.objectStore(STORE_BATCHES);
      const request = store.getAll();

      request.onerror = () => reject(new Error(`Failed to get batches: ${request.error?.message}`));
      request.onsuccess = async () => {
        const batches = request.result as BatchInfo[];
        const toDelete = batches.filter(
          (b) => b.status === 'completed' && b.createdAt < cutoff
        );

        for (const batch of toDelete) {
          await this.deleteBatch(batch.id);
        }

        resolve(toDelete.length);
      };
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private ensureOpen(): void {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const ledger = new Ledger();
