/**
 * Shared reachability probes for Sentinel checks: TCP connect with an ICMP
 * fallback, mirroring the approach the RADIUS check established.
 */

import net from 'node:net';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const TCP_TIMEOUT_MS = 5000;

export function isLoopback(host) {
  return /^127\.\d+\.\d+\.\d+$/.test(host) || host === '::1' || host === 'localhost';
}

export function tcpConnect(host, port, timeoutMs = TCP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function pingHost(host) {
  try {
    const { stdout } = await execAsync(`ping -c 2 -W 3 ${host}`, { timeout: 10000 });
    return (
      /\d+ received/.test(stdout) && !/ 0 received/.test(stdout) && !/100% packet loss/.test(stdout)
    );
  } catch {
    return false;
  }
}

/** TCP first (port-specific), ICMP as fallback. */
export async function probeHost(host, port) {
  if (await tcpConnect(host, port)) return { reachable: true, method: 'tcp' };
  const icmp = await pingHost(host);
  return { reachable: icmp, method: icmp ? 'icmp' : 'none' };
}
