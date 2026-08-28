/**
 * Controller certificate expiry check.
 *
 * The management API exposes no certificate metadata, so this check reads the
 * truth directly: a TLS handshake with the controller and the peer
 * certificate's validity window. Verification is intentionally permissive —
 * Campus Controllers routinely run self-signed certs and the rest of AURA
 * already accepts them; expiry is what bites (browsers and APs start refusing),
 * so expiry is what we alert on.
 */

import tls from 'node:tls';

const HANDSHAKE_TIMEOUT_MS = 8000;
const WARNING_DAYS = 30;
const CRITICAL_DAYS = 7;

function fetchPeerCertificate(host, port, timeoutMs = HANDSHAKE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (!cert || !cert.valid_to) {
          reject(new Error('no certificate presented'));
          return;
        }
        resolve(cert);
      }
    );
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error(`TLS handshake timed out after ${timeoutMs}ms`));
    });
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

export async function runCertExpiryCheck(opts, { fetchCertFn = fetchPeerCertificate } = {}) {
  if (!opts.controllerUrl) throw new Error('no controller URL configured');
  const url = new URL(opts.controllerUrl);
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 443;

  const cert = await fetchCertFn(host, port);

  const notAfter = new Date(cert.valid_to);
  const notBefore = cert.valid_from ? new Date(cert.valid_from) : null;
  const daysLeft = Math.floor((notAfter.getTime() - Date.now()) / 86_400_000);
  const subjectCn = cert.subject?.CN ?? host;
  const issuerCn = cert.issuer?.CN ?? 'unknown issuer';
  const selfSigned = JSON.stringify(cert.subject ?? {}) === JSON.stringify(cert.issuer ?? {});

  const alerts = [];
  if (daysLeft < 0) {
    alerts.push({
      id: `cert_expiry:${host}:${port}`,
      severity: 'critical',
      checkName: 'cert_expiry',
      message: `Controller certificate for ${subjectCn} EXPIRED ${-daysLeft} day(s) ago (${cert.valid_to})`,
      target: host,
      context: { host, port, subjectCn, issuerCn, validTo: cert.valid_to, daysLeft, selfSigned },
    });
  } else if (daysLeft <= CRITICAL_DAYS) {
    alerts.push({
      id: `cert_expiry:${host}:${port}`,
      severity: 'critical',
      checkName: 'cert_expiry',
      message: `Controller certificate for ${subjectCn} expires in ${daysLeft} day(s) (${cert.valid_to})`,
      target: host,
      context: { host, port, subjectCn, issuerCn, validTo: cert.valid_to, daysLeft, selfSigned },
    });
  } else if (daysLeft <= WARNING_DAYS) {
    alerts.push({
      id: `cert_expiry:${host}:${port}`,
      severity: 'warning',
      checkName: 'cert_expiry',
      message: `Controller certificate for ${subjectCn} expires in ${daysLeft} day(s) (${cert.valid_to})`,
      target: host,
      context: { host, port, subjectCn, issuerCn, validTo: cert.valid_to, daysLeft, selfSigned },
    });
  }

  const evidence = {
    certificate: {
      host: `${host}:${port}`,
      subject: subjectCn,
      issuer: issuerCn,
      selfSigned,
      validFrom: notBefore ? notBefore.toISOString() : null,
      validTo: notAfter.toISOString(),
      daysLeft,
    },
    thresholds: { warning: `${WARNING_DAYS} days`, critical: `${CRITICAL_DAYS} days` },
    summary:
      daysLeft < 0
        ? `Certificate expired ${-daysLeft} day(s) ago.`
        : `Certificate valid for ${daysLeft} more day(s) (${selfSigned ? 'self-signed' : `issued by ${issuerCn}`}).`,
  };

  return { alerts, evidence };
}
