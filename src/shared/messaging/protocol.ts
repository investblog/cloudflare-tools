/**
 * Type-safe message passing protocol between panel and background worker.
 */

import type { CFAccount, CFPaginationInfo, CFZone } from '../types/api';
import type { CredentialKind, ProfileInfo } from '../types/credentials';
import type { BatchInfo, BatchSummary, PreflightStatus, TaskEntry, TaskOperation } from '../types/tasks';

// ============================================================================
// Vault Messages
// ============================================================================

export interface VaultStatusRequest {
  type: 'VAULT_STATUS';
}

export interface VaultStatusResponse {
  isInitialized: boolean;
  isUnlocked: boolean;
  /** @deprecated active profile's email/label; superseded by profiles + activeProfileId. */
  email?: string;
  profiles: ProfileInfo[];
  activeProfileId: string | null;
}

// ============================================================================
// Profile Messages (multi-profile vault, v0.2.0)
// ============================================================================

export interface ProfileAddRequest {
  type: 'PROFILE_ADD';
  payload: {
    secret: string;
    kind?: CredentialKind; // required only when detectCredentialKind() === 'unknown'
    email?: string; // required for global-key
    accountId?: string; // manual fallback for account-token
    label?: string; // default: defaultProfileLabel()
  };
}

export interface ProfileAddResponse {
  profile: ProfileInfo;
  accounts: CFAccount[]; // may be [] (token without Account Settings:Read)
}

/** Re-enter a secret for an existing (stale) profile after a browser restart. */
export interface ProfileReauthRequest {
  type: 'PROFILE_REAUTH';
  payload: { profileId: string; secret: string };
}

export type ProfileReauthResponse = ProfileAddResponse;

export interface ProfileSwitchRequest {
  type: 'PROFILE_SWITCH';
  payload: { profileId: string };
}

export interface ProfileSwitchResponse {
  activeProfileId: string;
  accounts: CFAccount[];
}

export interface ProfileRemoveRequest {
  type: 'PROFILE_REMOVE';
  payload: { profileId: string };
}

export interface ProfileRemoveResponse {
  profiles: ProfileInfo[];
  activeProfileId: string | null;
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
    domains?: string[]; // For create operation
    zones?: Array<{ id: string; name: string }>; // For delete/purge operations (preferred)
    zoneIds?: string[]; // Legacy: delete/purge without names
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

export interface ProfileChangedEvent {
  type: 'PROFILE_CHANGED';
  payload: {
    activeProfileId: string | null;
    profiles: ProfileInfo[];
  };
}

/** Pushed to dash.cloudflare.com content scripts when settings change. */
export interface SettingsChangedEvent {
  type: 'SETTINGS_CHANGED';
  payload: Settings;
}

// ============================================================================
// Union Types
// ============================================================================

export type RequestMessage =
  | VaultStatusRequest
  | VaultLockRequest
  | VaultClearRequest
  | ProfileAddRequest
  | ProfileReauthRequest
  | ProfileSwitchRequest
  | ProfileRemoveRequest
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
  | IncompleteBatchesEvent
  | ProfileChangedEvent
  | SettingsChangedEvent;

// ============================================================================
// Response Mapping
// ============================================================================

type ResponseMap = {
  VAULT_STATUS: VaultStatusResponse;
  VAULT_LOCK: VaultLockResponse;
  VAULT_CLEAR: VaultClearResponse;
  PROFILE_ADD: ProfileAddResponse;
  PROFILE_REAUTH: ProfileReauthResponse;
  PROFILE_SWITCH: ProfileSwitchResponse;
  PROFILE_REMOVE: ProfileRemoveResponse;
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

/** The Error shape sendMessage rejects with. */
export interface MessagingError extends Error {
  code?: string;
  details?: unknown;
}

/** Error code from a sendMessage rejection ('' when absent). */
export function errorCode(error: unknown): string {
  return error instanceof Error ? ((error as MessagingError).code ?? '') : '';
}

/** The `recommendation` string a background error carried, if any. */
export function errorRecommendation(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const details = (error as MessagingError).details;
  if (details && typeof details === 'object' && 'recommendation' in details) {
    const rec = (details as { recommendation?: unknown }).recommendation;
    return typeof rec === 'string' ? rec : undefined;
  }
  return undefined;
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
export async function sendMessage<T extends RequestMessage>(message: T): Promise<ResponseMap[T['type']]> {
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
        const error = new Error(response.error?.message || 'Unknown error') as MessagingError;
        error.code = response.error?.code;
        error.details = response.error?.details;
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
  sender: chrome.runtime.MessageSender,
) => Promise<ResponseMap[T['type']]>;
