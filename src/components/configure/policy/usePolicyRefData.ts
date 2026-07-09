/**
 * Cross-resource reference data for the Policy editors (VLAN selects in the
 * Role editor, rate-limiter selects in CoS, member pools in VLAN Groups).
 * Loads each list once on demand; failures degrade to [] quietly — the owning
 * tab already surfaces its own load errors.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../../services/logger';
import {
  cosService,
  rateLimitersService,
  topologiesService,
} from '../../../services/configure';
import type { Cos, RateLimiter, Topology } from '../../../types/configure';

export interface PolicyRefDataOptions {
  topologies?: boolean;
  cos?: boolean;
  rateLimiters?: boolean;
}

export function usePolicyRefData(options: PolicyRefDataOptions) {
  const { topologies: wantTopos = false, cos: wantCos = false, rateLimiters: wantRl = false } =
    options;
  const [topologies, setTopologies] = useState<Topology[]>([]);
  const [cos, setCos] = useState<Cos[]>([]);
  const [rateLimiters, setRateLimiters] = useState<RateLimiter[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reloadTopologies = useCallback(async () => {
    if (!wantTopos) return;
    try {
      const data = await topologiesService.list();
      if (mountedRef.current) setTopologies(data);
    } catch (error) {
      logger.warn('[configure/policy] failed to load topologies reference list', error);
    }
  }, [wantTopos]);

  const reloadCos = useCallback(async () => {
    if (!wantCos) return;
    try {
      const data = await cosService.list();
      if (mountedRef.current) setCos(data);
    } catch (error) {
      logger.warn('[configure/policy] failed to load CoS reference list', error);
    }
  }, [wantCos]);

  const reloadRateLimiters = useCallback(async () => {
    if (!wantRl) return;
    try {
      const data = await rateLimitersService.list();
      if (mountedRef.current) setRateLimiters(data);
    } catch (error) {
      logger.warn('[configure/policy] failed to load rate-limiter reference list', error);
    }
  }, [wantRl]);

  useEffect(() => {
    void reloadTopologies();
  }, [reloadTopologies]);
  useEffect(() => {
    void reloadCos();
  }, [reloadCos]);
  useEffect(() => {
    void reloadRateLimiters();
  }, [reloadRateLimiters]);

  return { topologies, cos, rateLimiters, reloadTopologies, reloadCos, reloadRateLimiters };
}
