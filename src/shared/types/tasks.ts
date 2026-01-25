/**
 * Task Ledger Types for batch operations persistence
 */

export type TaskOperation = 'create' | 'delete' | 'purge';

export type TaskStatus =
  | 'queued'    // В очереди
  | 'running'   // Выполняется
  | 'success'   // Успешно
  | 'failed'    // Ошибка (retryable)
  | 'skipped'   // Пропущен (exists/duplicate)
  | 'blocked'   // Заблокирован (dependency)
  | 'invalid';  // Невалидный ввод

export type PreflightStatus =
  | 'will-create'  // Зона не существует, будет создана
  | 'exists'       // Зона уже есть в аккаунте → skip
  | 'invalid'      // Невалидный домен (парсер отклонил)
  | 'duplicate';   // Дубликат в списке ввода

export interface TaskEntry {
  id: string;
  batchId: string;
  domain: string;
  operation: TaskOperation;
  status: TaskStatus;
  preflightStatus?: PreflightStatus;
  attempt: number;
  zoneId?: string;
  errorCode?: number;
  errorMessage?: string;
  latencyMs?: number;
  createdAt: number;
  updatedAt: number;
}

export type BatchStatus = 'pending' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface BatchInfo {
  id: string;
  operation: TaskOperation;
  accountId: string;
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  blockedCount: number;
  status: BatchStatus;
  createdAt: number;
  updatedAt: number;
}

export interface BatchSummary {
  processed: number;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  blocked: number;
  etaMs: number | null;
}

export interface ExportedTask {
  domain: string;
  operation: TaskOperation;
  status: TaskStatus;
  errorCode?: number;
  errorMessage?: string;
  attempt: number;
  latencyMs?: number;
  zoneId?: string;
}
