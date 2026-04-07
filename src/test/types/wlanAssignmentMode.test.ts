import { describe, it, expectTypeOf } from 'vitest';
import type { WlanAssignmentMode, WLANFormData } from '../../types/network';

describe('WlanAssignmentMode', () => {
  it('is a union of three string literals', () => {
    expectTypeOf<WlanAssignmentMode>().toEqualTypeOf<
      'unassigned' | 'all_sites' | 'selected_targets'
    >();
  });
  it('WLANFormData includes assignmentMode', () => {
    expectTypeOf<WLANFormData['assignmentMode']>().toEqualTypeOf<WlanAssignmentMode>();
  });
  it('WLANFormData includes assignedSiteIds and assignedSiteGroupIds', () => {
    expectTypeOf<WLANFormData['assignedSiteIds']>().toEqualTypeOf<string[]>();
    expectTypeOf<WLANFormData['assignedSiteGroupIds']>().toEqualTypeOf<string[]>();
  });
  it('WLANFormData includes optional templateId', () => {
    expectTypeOf<WLANFormData['templateId']>().toEqualTypeOf<string | undefined>();
  });
});
