/**
 * useStickySiteSelection — a page's selected site, remembered across navigation.
 *
 * AURA has no URL router, so a page that held its site selection in plain
 * `useState` silently reset to "All Sites" the moment the user navigated away
 * and back. That makes the site context feel like it evaporates mid-task.
 *
 * The selection is kept per page rather than in one global filter on purpose:
 * pages disagree about what a site's value *is*. Access Points and Clients
 * filter rows by site **name**; App Insights and Service Levels fetch per-site
 * by **id**. One shared value would have each page handing the other a token it
 * cannot interpret. `useGlobalFilters().site` remains the id-keyed selection
 * that Service Levels and the dashboard share.
 *
 * Storage is `sessionStorage`: the selection should survive navigation within
 * the session, not resurrect a site the user last looked at days ago. A site
 * that has since been deleted simply leaves the picker on its placeholder for
 * the user to re-pick — no crash, no phantom filter.
 */

import { useCallback, useState } from 'react';

const KEY_PREFIX = 'aura_site_selection:';

/** Default when nothing is remembered: every OS1 site, matching the pickers. */
const ALL = 'all';

function read(pageKey: string): string {
  try {
    return sessionStorage.getItem(KEY_PREFIX + pageKey) || ALL;
  } catch {
    // Private-mode / storage-disabled browsers still get a working picker.
    return ALL;
  }
}

/**
 * @param pageKey Stable identifier for the page, e.g. 'access-points'. Pages
 *   that key sites differently (name vs id) must not share a key.
 */
export function useStickySiteSelection(pageKey: string): [string, (value: string) => void] {
  const [selected, setSelected] = useState<string>(() => read(pageKey));

  const select = useCallback(
    (value: string) => {
      setSelected(value);
      try {
        sessionStorage.setItem(KEY_PREFIX + pageKey, value);
      } catch {
        /* selection still works for this mount */
      }
    },
    [pageKey]
  );

  return [selected, select];
}
