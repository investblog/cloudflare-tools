/**
 * Type-safe message passing protocol between panel/popup and background worker.
 */

import type {
  CFUser,
  CFAccount,
  CFZone,
  CFPaginationInfo,
} from '../types/api';
import type {
  TaskOperation,
  PreflightStatus,
  BatchInfo,
  BatchSummary,
  TaskEntry,
} from '../types/tasks';

// ============================================================================
// Vault Messages
// ============================================================================

export interface VaultStatusRequest {
  type: 'VAULT_STATUS';
}

export interface VaultStatusResponse {
  isInitialized: boolean;
  isUnlocked: boolean;
  email?: string;
}

export interface VaultSetupRequest {
  type: 'VAULT_SETUP';
  payload: {
    email: string;
    apiKey: string;
  };
}

export interface VaultSetupResponse {
  user: CFUser;
  accounts: CFAccount[];
}

export interface VaultLockRequest {
  type: 'VAULT_LOCK';
}

export interface VaultLockResponse {
  success: true;
}

export interface VaultClearRequest {
  type: 'VAULT_CLEAR';
}

export interface VaultClearResponse {
  success: true;
}

// ============================================================================
// Account/Zone Messages
// ============================================================================

export interface GetAccountsRequest {
  type: 'GET_ACCOUNTS';
}

export interface GetAccountsResponse {
  accounts: CFAccount[];
}

export interface GetZonesRequest {
  type: 'GET_ZONES';
  payload: {
    accountId: string;
    page?: number;
    perPage?: number;
  };
}

export interface GetZonesResponse {
  zones: CFZone[];
  pagination: CFPaginationInfo;
}

// ============================================================================
// Preflight Messages
// ============================================================================

export interface CheckPreflightRequest {
  type: 'CHECK_PREFLIGHT';
  payload: {
    domains: string[];
    accountId: string;
  };
}

export interface PreflightResult {
  domain: string;
  status: PreflightStatus;
  existingZoneId?: string;
}

export interface CheckPreflightResponse {
  results: PreflightResult[];
}

// ============================================================================
// Batch Operation Messages
// ============================================================================

export interface StartBatchRequest {
  type: 'START_BATCH';
  payload: {
    operation: TaskOperation;
    accountId: string;
    domains?: string[];                              // For create operation
    zones?: Array<{ id: string; name: string }>;     // For delete/purge operations (preferred)
    zoneIds?: string[];                              // Legacy: delete/purge without names
    options?: {
      type?: 'full' | 'partial';
      jumpStart?: boolean;
    };
  };
}

export interface StartBatchResponse {
  batchId: string;
}

export interface PauseBatchRequest {
  type: 'PAUSE_BATCH';
  payload: {
    batchId: string;
  };
}

export interface PauseBatchResponse {
  success: true;
}

export interface ResumeBatchRequest {
  type: 'RESUME_BATCH';
  payload: {
    batchId: string;
  };
}

export interface ResumeBatchResponse {
  success: true;
}

export interface CancelBatchRequest {
  type: 'CANCEL_BATCH';
  payload: {
    batchId: string;
  };
}

export interface CancelBatchResponse {
  success: true;
}

export interface GetBatchProgressRequest {
  type: 'GET_BATCH_PROGRESS';
  payload: {
    batchId: string;
  };
}

export interface GetBatchProgressResponse {
  batch: BatchInfo;
  summary: BatchSummary;
}

export interface RetryFailedRequest {
  type: 'RETRY_FAILED';
  payload: {
    batchId: string;
  };
}

export interface RetryFailedResponse {
  newBatchId: string;
  count: number;
}

export interface GetFailedTasksRequest {
  type: 'GET_FAILED_TASKS';
  payload: {
    batchId: string;
  };
}

export interface GetFailedTasksResponse {
  tasks: TaskEntry[];
}

export interface GetIncompleteBatchesRequest {
  type: 'GET_INCOMPLETE_BATCHES';
}

export interface GetIncompleteBatchesResponse {
  batches: BatchInfo[];
}

// ============================================================================
// Settings Messages
// ============================================================================

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface Settings {
  maxConcurrency: number;
  enableDashboardButtons: boolean;
}

export interface GetSettingsResponse {
  settings: Settings;
}

export interface UpdateSettingsRequest {
  type: 'UPDATE_SETTINGS';
  payload: Partial<Settings>;
}

export interface OpenSidePanelRequest {
  type: 'OPEN_SIDE_PANEL';
}

export interface OpenSidePanelResponse {
  opened: boolean;
}

export interface UpdateSettingsResponse {
  settings: Settings;
}

// ============================================================================
// Background → Panel Events (pushed via chrome.runtime.sendMessage)
// ============================================================================

export interface BatchProgressEvent {
  type: 'BATCH_PROGRESS';
  payload: {
    batchId: string;
    summary: BatchSummary;
    latestTask?: TaskEntry;
  };
}

export interface BatchCompletedEvent {
  type: 'BATCH_COMPLETED';
  payload: {
    batchId: string;
    summary: BatchSummary;
  };
}

export interface VaultLockedEvent {
  type: 'VAULT_LOCKED';
}

export interface IncompleteBatchesEvent {
  type: 'INCOMPLETE_BATCHES';
  payload: {
    batches: BatchInfo[];
  };
}

// ============================================================================
// Union Types
// ============================================================================

export type RequestMessage =
  | VaultStatusRequest
  | VaultSetupRequest
  | VaultLockRequest
  | VaultClearRequest
  | GetAccountsRequest
  | GetZonesRequest
  | CheckPreflightRequest
  | StartBatchRequest
  | PauseBatchRequest
  | ResumeBatchRequest
  | CancelBatchRequest
  | GetBatchProgressRequest
  | RetryFailedRequest
  | GetFailedTasksRequest
  | GetIncompleteBatchesRequest
  | GetSettingsRequest
  | UpdateSettingsRequest
  | OpenSidePanelRequest;

export type BackgroundEvent =
  | BatchProgressEvent
  | BatchCompletedEvent
  | VaultLockedEvent
  | IncompleteBatchesEvent;

// ============================================================================
// Response Mapping
// ============================================================================

type ResponseMap = {
  VAULT_STATUS: VaultStatusResponse;
  VAULT_SETUP: VaultSetupResponse;
  VAULT_LOCK: VaultLockResponse;
  VAULT_CLEAR: VaultClearResponse;
  GET_ACCOUNTS: GetAccountsResponse;
  GET_ZONES: GetZonesResponse;
  CHECK_PREFLIGHT: CheckPreflightResponse;
  START_BATCH: StartBatchResponse;
  PAUSE_BATCH: PauseBatchResponse;
  RESUME_BATCH: ResumeBatchResponse;
  CANCEL_BATCH: CancelBatchResponse;
  GET_BATCH_PROGRESS: GetBatchProgressResponse;
  RETRY_FAILED: RetryFailedResponse;
  GET_FAILED_TASKS: GetFailedTasksResponse;
  GET_INCOMPLETE_BATCHES: GetIncompleteBatchesResponse;
  GET_SETTINGS: GetSettingsResponse;
  UPDATE_SETTINGS: UpdateSettingsResponse;
  OPEN_SIDE_PANEL: OpenSidePanelResponse;
};

// ============================================================================
// Error Types
// ============================================================================

export interface MessageError {
  code: string;
  message: string;
  details?: unknown;
}

export interface MessageResponse<T> {
  success: boolean;
  data?: T;
  error?: MessageError;
}

// ============================================================================
// Send Message Function
// ============================================================================

/**
 * Type-safe wrapper for chrome.runtime.sendMessage.
 * Automatically infers response type based on message type.
 */
export async function sendMessage<T extends RequestMessage>(
  message: T
): Promise<ResponseMap[T['type']]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<ResponseMap[T['type']]>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error('No response from background'));
        return;
      }

      if (!response.success) {
        const error = new Error(response.error?.message || 'Unknown error');
        (error as Error & { code?: string }).code = response.error?.code;
        reject(error);
        return;
      }

      resolve(response.data as ResponseMap[T['type']]);
    });
  });
}

/**
 * Helper to create a typed message handler for background script.
 */
export type MessageHandler<T extends RequestMessage> = (
  message: T,
  sender: chrome.runtime.MessageSender
) => Promise<ResponseMap[T['type']]>;
