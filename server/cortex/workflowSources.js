/**
 * The authoritative sources the blocker ladder consults.
 *
 * Rung 2 of the ladder ("can an authoritative source answer this?") needs three
 * reads: the site catalogue, the APs at a site, and the topologies/VLANs at a
 * site. This module is the only place that knows how to get them, so the ladder
 * itself stays testable with plain functions and no Gateway.
 *
 * THE RULE EVERY READ HERE FOLLOWS
 * --------------------------------
 * A failed read THROWS. It does not return an empty array.
 *
 * That is the opposite of defensive, and it is deliberate: the ladder treats an
 * empty result as a real answer about the network ("no APs are at this site, so
 * the network would not broadcast") and a thrown error as "we could not find
 * out". Swallowing a 500 into `[]` would turn an unreachable Gateway into a
 * confident, wrong statement about the customer's estate — the exact failure the
 * diagnostic tools already guard against on the read side.
 *
 * AP-TO-SITE IS `hostSite`, AND ONLY `hostSite`
 * ---------------------------------------------
 * Rows from `/v1/aps/query` carry neither `siteId` nor `siteName`. Filtering on
 * those matched zero APs at every site, which made `ap_model_support` block
 * every WLAN creation ever attempted (fixed in 8c50fe33). The same field is used
 * here, for the same reason, with the id kept only as a secondary match.
 */

/** Compare site names the way the validator does: case- and space-insensitive. */
function sameSite(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Read a path, or throw with a message worth showing an operator. */
async function read(session, path, what) {
  const result = await session.get(path);
  if (!result?.ok) {
    throw new Error(result?.errorSummary ?? `could not read ${what} (HTTP ${result?.status})`);
  }
  return result.data;
}

function asRows(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

/**
 * Build the source set for one request's session.
 *
 * @param {object} session  a RequestScopedSession — the CALLER's token, so the
 *                          Gateway's own RBAC remains the ceiling.
 */
export function buildWorkflowSources(session) {
  if (!session) return {};

  return {
    /** Every site on this Gateway. */
    listSites: async () => {
      const data = await read(session, '/v3/sites', 'the site catalogue');
      return asRows(data, 'sites').map((s) => ({
        id: s.id,
        siteName: s.siteName ?? s.name,
      }));
    },

    /**
     * The APs at a site, in service.
     *
     * An AP that is administratively present but not InService cannot carry a
     * new WLAN, so counting it would produce a plan that silently half-works.
     */
    listAps: async (siteName) => {
      const data = await read(session, '/v1/aps/query', 'the access point inventory');
      const rows = asRows(data, 'aps');
      if (!siteName) return rows;
      return rows.filter(
        (ap) => sameSite(ap.hostSite, siteName) || sameSite(ap.siteName, siteName)
      );
    },

    /** The topologies (VLANs) available, narrowed to a site where the row says. */
    listTopologies: async (siteName) => {
      const data = await read(session, '/v1/topologies', 'the VLAN list');
      const rows = asRows(data, 'topologies');
      if (!siteName) return rows;
      // Most topologies are Gateway-wide and carry no site, so an unsited row
      // is a candidate rather than an exclusion.
      return rows.filter((t) => !t.siteName || sameSite(t.siteName, siteName));
    },
  };
}

export const __testing = { sameSite, asRows };
