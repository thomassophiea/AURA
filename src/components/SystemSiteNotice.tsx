/**
 * SystemSiteNotice — what a page shows when a system site is selected but that
 * page's data is scoped per Site by the source system.
 *
 * OS1 Staging and the XIQ Default Site are offered in every site picker, because
 * hiding them would make the hierarchy read as if they did not exist. But some
 * pages ask the Gateway or XIQ for data *for a site id*, and neither system has
 * per-site analytics for devices that are not in a site. Rather than send a
 * sentinel as a site id — which returns either nothing or, worse, everything —
 * those pages skip the request and say so here.
 *
 * The tone is deliberately neutral. Staging is an expected location, not a
 * fault, so this is an explanation and not a warning.
 */

import { Info } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export interface SystemSiteNoticeProps {
  /** Display name of the selected system site, e.g. 'Staging'. */
  siteName: string;
  /** What this page in particular cannot report for it. */
  detail: string;
}

export function SystemSiteNotice({ siteName, detail }: SystemSiteNoticeProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 py-8">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No data for {siteName}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
