/**
 * Deployment types for the Global Elements deployment pipeline.
 */

import type { GlobalElementType } from './globalElements';
import type { VariableScope } from './siteVariables';
import type { SiteGroup } from './domain';

// ---------------------------------------------------------------------------
// Deployment result
// ---------------------------------------------------------------------------

export type DeploymentStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

export interface DeploymentResult {
  template_id: string;
  template_name: string;
  element_type: GlobalElementType;
  scope_type: VariableScope;
  scope_id: string;
  scope_name: string;
  status: DeploymentStatus;
  controller_url: string;
  /** The created/updated resource returned by the controller. */
  response_data?: unknown;
  error_message?: string;
  started_at: string;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Deployment history (persisted to Supabase)
// ---------------------------------------------------------------------------

export interface DeploymentRecord {
  id: string;
  org_id: string;
  template_id: string;
  template_name?: string;
  element_type?: string;
  scope_type: VariableScope;
  scope_id: string;
  scope_name?: string;
  status: DeploymentStatus;
  result_payload?: unknown;
  error_message?: string;
  deployed_by?: string;
  deployed_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

export interface DeploymentTarget {
  scope_type: VariableScope;
  scope_id: string;
  scope_name: string;
  site_group: SiteGroup;
}

export interface PipelineOptions {
  stop_on_failure: boolean;
  dry_run: boolean;
}

export interface PipelineProgress {
  completed: number;
  total: number;
  current_target: DeploymentTarget | null;
  results: DeploymentResult[];
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

export type DriftStatus = 'in_sync' | 'drifted' | 'missing' | 'unknown' | 'error';

export interface FieldDiff {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface DriftCheckResult {
  template_id: string;
  template_name: string;
  element_type: GlobalElementType;
  scope_id: string;
  scope_name: string;
  controller_url: string;
  status: DriftStatus;
  diffs: FieldDiff[];
  checked_at: string;
  error_message?: string;
}

export interface DriftSummary {
  total: number;
  in_sync: number;
  drifted: number;
  missing: number;
  errors: number;
  results: DriftCheckResult[];
  checked_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

export interface PipelineResult {
  pipeline_id: string;
  template_id: string;
  template_name: string;
  started_at: string;
  completed_at: string;
  total_targets: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: DeploymentResult[];
}
