/**
 * AP trace contract helpers: the gateway's ApRpt date-stamp rename, the
 * 404-means-no-archive traceurls listing, and the comma-joined downloadtrace
 * path (all recovered from the gateway UI's own ap-controller/device-data-
 * factory — see apsData.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/api', () => ({
  apiService: { makeAuthenticatedRequest: vi.fn() },
  getDynamicControllerUrl: () => null,
}));

import { apiService } from '../../../services/api';
import { apsData, traceDownloadName } from './apsData';

const mockRequest = apiService.makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe('traceDownloadName', () => {
  it('replaces the ApRpt prefix through the first dash with a dated one', () => {
    expect(
      traceDownloadName('ApRpt20250101T010101-CV012408S-C0102.tar', new Date(2026, 7, 31))
    ).toBe('ApRpt20260831-CV012408S-C0102.tar');
  });

  it('zero-pads single-digit month and day', () => {
    expect(traceDownloadName('ApRptX-abc.tar', new Date(2026, 0, 5))).toBe('ApRpt20260105-abc.tar');
  });

  it('leaves names without an ApRpt prefix unchanged', () => {
    expect(traceDownloadName('trace.tar', new Date(2026, 7, 31))).toBe('trace.tar');
  });
});

describe('apsData.listTraceFiles', () => {
  it('GETs /v1/aps/{serial}/traceurls and returns the file names', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(['ApRpt1-x.tar']));
    await expect(apsData.listTraceFiles('CV 01')).resolves.toEqual(['ApRpt1-x.tar']);
    expect(mockRequest.mock.calls[0][0]).toBe('/v1/aps/CV%2001/traceurls');
  });

  it('treats a 404 (no trace archive yet — lab-verified) as an empty list', async () => {
    mockRequest.mockResolvedValueOnce(
      jsonResponse({ errors: [{ errorMessage: 'NOT FOUND', errorCode: 404 }] }, 404)
    );
    await expect(apsData.listTraceFiles('SN1')).resolves.toEqual([]);
  });

  it('propagates non-404 failures', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(apsData.listTraceFiles('SN1')).rejects.toThrow();
  });
});

describe('apsData.downloadTraceFiles', () => {
  it('comma-joins the file list into one downloadtrace GET', async () => {
    mockRequest.mockResolvedValueOnce(new Response(new Blob(['tar']), { status: 200 }));
    await apsData.downloadTraceFiles(['a.tar', 'b.tar']);
    expect(mockRequest.mock.calls[0][0]).toBe('/v1/aps/downloadtrace/a.tar,b.tar');
    expect(mockRequest.mock.calls[0][1]).toEqual({ headers: { accept: 'application/tar' } });
  });

  it('throws on a non-2xx response', async () => {
    mockRequest.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(apsData.downloadTraceFiles(['a.tar'])).rejects.toThrow('404');
  });
});
