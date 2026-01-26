/**
 * Cloudflare API Types
 */

export interface CFUser {
  id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  telephone: string | null;
  country: string | null;
  created_on: string;
  modified_on: string;
  two_factor_authentication_enabled: boolean;
  suspended: boolean;
}

export interface CFAccount {
  id: string;
  name: string;
  type: string;
  created_on: string;
  settings?: {
    enforce_twofactor: boolean;
  };
}

export interface CFZone {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated';
  paused: boolean;
  type: 'full' | 'partial';
  development_mode: number;
  name_servers: string[];
  original_name_servers: string[] | null;
  original_registrar: string | null;
  original_dnshost: string | null;
  created_on: string;
  modified_on: string;
  activated_on: string | null;
  account: {
    id: string;
    name: string;
  };
  permissions: string[];
  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    frequency: string;
    legacy_id: string;
    is_subscribed: boolean;
    can_subscribe: boolean;
  };
}

export interface CFApiResponse<T> {
  success: boolean;
  errors: CFApiError[];
  messages: string[];
  result: T;
  result_info?: CFPaginationInfo;
}

export interface CFApiError {
  code: number;
  message: string;
  error_chain?: CFApiError[];
}

export interface CFPaginationInfo {
  page: number;
  per_page: number;
  count: number;
  total_count: number;
  total_pages: number;
}

export interface CreateZoneRequest {
  name: string;
  account: { id: string };
  type?: 'full' | 'partial';
  jump_start?: boolean;
}

export interface PurgeCacheRequest {
  purge_everything?: boolean;
  files?: string[];
  tags?: string[];
  hosts?: string[];
}

export interface PurgeCacheResponse {
  id: string;
}
