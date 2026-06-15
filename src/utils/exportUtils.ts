/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Export data to CSV format
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  filename: string
): void {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Build header row
  const header = columns.map((col) => `"${col.label}"`).join(',');

  // Build data rows
  const rows = data
    .map((item) =>
      columns
        .map((col) => {
          const value = item[col.key];
          // Handle different value types
          if (value === null || value === undefined) return '""';
          if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
          if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          return `"${value}"`;
        })
        .join(',')
    )
    .join('\n');

  const csv = `${header}\n${rows}`;

  // Create and trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data to JSON format
 */
export function exportToJSON<T>(data: T[], filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Print data as a simple report (opens print dialog)
 */
export function printReport<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  title: string
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 10px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        tr:nth-child(even) { background-color: #fafafa; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString()} | Total: ${data.length} records</div>
      <table>
        <thead>
          <tr>${columns.map((col) => `<th>${col.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${data
            .map(
              (item) => `
            <tr>${columns.map((col) => `<td>${item[col.key] ?? ''}</td>`).join('')}</tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

/**
 * Print a Sentinel infrastructure health report
 */
export function printSentinelReport(snapshot: {
  checks: Record<string, { status: string; lastRunAt: string | null; alertCount?: number }>;
  alerts: Array<{ severity: string; checkName: string; message: string; target: string; occurrences: number; lastSeenAt: string }>;
  evidence: Record<string, { summary: string; collectedAt: string }>;
}): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const checkRows = Object.entries(snapshot.checks)
    .map(([name, c]) => `<tr><td>${name}</td><td>${c.status}</td><td>${c.lastRunAt ? new Date(c.lastRunAt).toLocaleString() : '—'}</td><td>${c.alertCount ?? 0}</td></tr>`)
    .join('');

  const alertRows = snapshot.alerts
    .map((a) => `<tr><td><span class="sev-${a.severity}">${a.severity}</span></td><td>${a.checkName}</td><td>${a.message}</td><td>${a.target}</td><td>${a.occurrences}</td><td>${new Date(a.lastSeenAt).toLocaleString()}</td></tr>`)
    .join('');

  const evidenceSections = Object.entries(snapshot.evidence)
    .map(([name, e]) => `<div class="evidence"><strong>${name}</strong> <span class="meta">(${new Date(e.collectedAt).toLocaleString()})</span><p>${e.summary}</p></div>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><title>Sentinel Report</title><style>
    body{font-family:Arial,sans-serif;padding:20px;font-size:13px}
    h1{font-size:18px;margin-bottom:4px} h2{font-size:15px;margin-top:24px}
    .meta{font-size:11px;color:#666;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f5f5f5;font-weight:bold} tr:nth-child(even){background:#fafafa}
    .sev-critical{color:#ef4444;font-weight:bold} .sev-warning{color:#f59e0b;font-weight:bold}
    .evidence{margin-bottom:12px;padding:8px;border:1px solid #e5e5e5;border-radius:4px}
    .evidence p{margin:4px 0 0;color:#444}
    @media print{body{padding:0}}
  </style></head><body>
    <h1>Sentinel Infrastructure Report</h1>
    <div class="meta">Generated: ${new Date().toLocaleString()}</div>

    <h2>Check Summary</h2>
    <table><thead><tr><th>Check</th><th>Status</th><th>Last Run</th><th>Alerts</th></tr></thead><tbody>${checkRows || '<tr><td colspan="4">No checks run yet</td></tr>'}</tbody></table>

    <h2>Active Alerts</h2>
    ${snapshot.alerts.length > 0 ? `<table><thead><tr><th>Severity</th><th>Check</th><th>Message</th><th>Target</th><th>Occurrences</th><th>Last Seen</th></tr></thead><tbody>${alertRows}</tbody></table>` : '<p>No active alerts.</p>'}

    <h2>Evidence</h2>
    ${evidenceSections || '<p>No evidence collected yet.</p>'}
  </body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}
