import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createValidationRouter } from './validationRouter.js';
import { driftMonitor } from './driftMonitor.js';

function makeApp(fetchFn) {
  const app = express();
  app.use((req, _res, next) => {
    req.headers['authorization'] = 'Bearer test-tok';
    req.headers['x-controller-url'] = 'https://ctrl.local';
    next();
  });
  app.use('/api', createValidationRouter({ fetchFn }));
  return app;
}

const TOPOLOGIES = [
  { id: 't1', name: 'Corp', vlanid: 1, dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' },
];
const APS = { data: [{ apSerialNum: 'AP1', apAssignedProfileId: 'prof-1' }] };
const LLDP = [{ switchPort: '1', systemName: 'sw1', vlanMembership: { tagged: [1], untagged: [] } }];
const PROFILES = [{
  name: 'Site-A',
  radioIfList: [{ serviceId: 's1', index: 1 }],
  radios: [{ radioName: 'Radio 1 - 2.4 GHz', index: 1 }],
}];

describe('validationRouter', () => {
  beforeEach(() => { driftMonitor.clearAlerts(); });

  it('POST /api/validate/intent returns a validation report', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => TOPOLOGIES })   // /v1/topologies
      .mockResolvedValueOnce({ ok: true, json: async () => APS })           // /v1/aps
      .mockResolvedValueOnce({ ok: true, json: async () => LLDP })          // /v1/aps/AP1/lldp
      .mockResolvedValueOnce({ ok: true, json: async () => PROFILES });     // /v3/profiles

    const app = makeApp(mockFetch);
    const res = await request(app)
      .post('/api/validate/intent')
      .send({ intent: { action: 'create_ssid', ssid_name: 'Test', vlan: 1, security: 'WPA2-PSK' } });

    expect(res.status).toBe(200);
    expect(res.body.checks).toBeDefined();
    expect(res.body.confidence).toBeDefined();
    expect(res.body.confidence.band).toMatch(/HIGH|MEDIUM|LOW|BLOCK/);
    expect(res.body.recommendation).toBeDefined();
    expect(res.body.provisioningToken).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });

  it('POST /api/validate/intent returns 400 when intent.vlan is missing', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app)
      .post('/api/validate/intent')
      .send({ intent: {} });
    expect(res.status).toBe(400);
  });

  it('GET /api/validate/vlan/:vlanId returns pass for existing VLAN', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => TOPOLOGIES });
    const app = makeApp(mockFetch);
    const res = await request(app).get('/api/validate/vlan/1');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('pass');
    expect(res.body.dhcp).toBeDefined();
  });

  it('GET /api/validate/vlan/:vlanId returns fail for missing VLAN', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => TOPOLOGIES });
    const app = makeApp(mockFetch);
    const res = await request(app).get('/api/validate/vlan/999');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('fail');
    expect(res.body.dhcp).toBeNull();
  });

  it('GET /api/validate/vlan/:vlanId returns 400 for non-integer', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app).get('/api/validate/vlan/abc');
    expect(res.status).toBe(400);
  });

  it('GET /api/drift returns empty alerts initially', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app).get('/api/drift');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual([]);
    expect(res.body.status).toBeDefined();
  });

  it('DELETE /api/drift clears alerts', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app).delete('/api/drift');
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
  });

  it('POST /api/rollback/:auditId returns 404 for unknown auditId', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app).post('/api/rollback/unknown-id');
    expect(res.status).toBe(404);
  });

  it('GET /validate/topology returns 200 with lldp data', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ apSerialNum: 'AP001' }] }) // /v1/aps
      .mockResolvedValueOnce({ ok: true, json: async () => [] });                         // /v1/aps/AP001/lldp
    const app = makeApp(mockFetch);
    const res = await request(app).get('/api/validate/topology');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('lldp');
  });
});
