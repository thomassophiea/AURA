import { describe, it, expectTypeOf } from 'vitest';
import type { WLANAssignmentMode, WLANFormData } from '../../types/network';

describe('WLANAssignmentMode', () => {
  it('is a union of three string literals', () => {
    expectTypeOf<WLANAssignmentMode>().toEqualTypeOf<
      'unassigned' | 'all_sites' | 'selected_targets'
    >();
  });
  it('WLANFormData includes assignmentMode', () => {
    expectTypeOf<WLANFormData['assignmentMode']>().toEqualTypeOf<WLANAssignmentMode>();
  });
  it('WLANFormData includes assignedSiteIds and assignedSiteGroupIds', () => {
    expectTypeOf<WLANFormData['assignedSiteIds']>().toEqualTypeOf<string[]>();
    expectTypeOf<WLANFormData['assignedSiteGroupIds']>().toEqualTypeOf<string[]>();
  });
  it('WLANFormData includes optional templateId', () => {
    expectTypeOf<WLANFormData['templateId']>().toEqualTypeOf<string | undefined>();
  });
});
