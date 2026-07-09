/** Shared prop shape for the Site editor tab components. */
import type { SiteConfig } from '../../../types/configure';
import type { SiteRefs } from './useSiteRefs';

export interface SiteTabProps {
  form: SiteConfig;
  update: (path: string, value: unknown) => void;
  errs: Record<string, string>;
  isNew: boolean;
  refs: SiteRefs;
}
