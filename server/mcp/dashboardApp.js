/**
 * `show_dashboard` — an MCP App: the tool returns the estate's health as
 * structured data, and hosts that support MCP Apps (claude.ai, Claude Desktop)
 * render it as a live card instead of a wall of JSON. Hosts that do not, get
 * the same data as text.
 *
 * The page is self-contained: no CDN, no build. It speaks the MCP Apps
 * postMessage protocol (JSON-RPC 2.0, extension version 2026-01-26) by hand —
 * ui/initialize → ui/notifications/initialized, then renders every
 * ui/notifications/tool-result and reports its height so the host sizes the
 * frame. Every network-sourced string is inserted with textContent, never as
 * HTML: an SSID or site name is data, not markup.
 */

import { untrusted } from '../cortex/diagnosticTools.js';
import { isNotReporting } from '../cortex/deviceHealth.js';
import { infrastructureAlerts, serviceLevels } from '../cortex/operationalEvidence.js';

export const DASHBOARD_URI = 'ui://aura/dashboard';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AURA network health</title>
<style>
:root{--bg:#ffffff;--fg:#1d1b2f;--muted:#5d5a73;--line:#e4e2ee;--card:#f7f6fb;--good:#1a7f37;--fair:#9a6700;--poor:#c62828;--none:#8a879c;--accent:#6930df}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#16141f;--fg:#ecebf3;--muted:#a9a6bd;--line:#2c2a3a;--card:#1f1d2b;--good:#4cc36b;--fair:#e0b341;--poor:#ff6b6b;--none:#7d7a90;--accent:#a68bff}}
:root[data-theme=dark]{--bg:#16141f;--fg:#ecebf3;--muted:#a9a6bd;--line:#2c2a3a;--card:#1f1d2b;--good:#4cc36b;--fair:#e0b341;--poor:#ff6b6b;--none:#7d7a90;--accent:#a68bff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{padding:16px}header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:12px}
h1{font-size:16px;margin:0;font-weight:650}.sub{color:var(--muted);font-size:12px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.kpi b{display:block;font-size:22px;font-weight:650;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-size:12px;color:var(--muted);font-weight:600}td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.bar{height:6px;border-radius:3px;background:var(--line);width:90px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:6px}
.bar i{display:block;height:100%}.pill{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.good{color:var(--good)}.fair{color:var(--fair)}.poor{color:var(--poor)}.none{color:var(--none)}
.alerts{margin-top:14px}.alerts li{margin:4px 0}.empty{color:var(--muted);padding:12px 0}
@media (max-width:520px){.hide-sm{display:none}}
</style></head>
<body><main id="root"><p class="empty">Waiting for AURA data…</p></main>
<script>
(function(){
  var nextId=1, root=document.getElementById('root');
  function send(msg){ window.parent.postMessage(msg,'*'); }
  function request(method,params){ var id=nextId++; send({jsonrpc:'2.0',id:id,method:method,params:params||{}}); return id; }
  function notify(method,params){ send({jsonrpc:'2.0',method:method,params:params||{}}); }
  function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!==undefined&&text!==null) e.textContent=String(text); return e; }
  function val(v){ return v&&typeof v==='object'&&v.__untrusted__? v.value : v; }
  function cls(status){ return status==='good'?'good':status==='fair'?'fair':status==='poor'?'poor':'none'; }
  function resize(){ notify('ui/notifications/size-changed',{height:Math.ceil(document.documentElement.scrollHeight)}); }
  function render(d){
    if(!d||typeof d!=='object'){ return; }
    root.textContent='';
    var head=el('header'); var h=el('h1',null,'Network health'+(d.gateway?' — '+val(d.gateway):''));
    head.appendChild(h); head.appendChild(el('span','sub',(d.freshness&&d.freshness.servedFrom==='cache'?'cached ':'')+'as of '+new Date(d.generatedAt||Date.now()).toLocaleString()));
    root.appendChild(head);
    var k=el('div','kpis'); var t=d.totals||{};
    [[t.sitesScored,'sites scored'],[t.poorSites,'poor sites'],[t.apsConnected,'APs connected'],[t.apsOffline,'APs offline'],[t.alertsCritical,'critical alerts']].forEach(function(p){
      var c=el('div','kpi'); c.appendChild(el('b',null,p[0]===null||p[0]===undefined?'–':p[0])); c.appendChild(el('span',null,p[1])); k.appendChild(c);
    });
    root.appendChild(k);
    var sites=d.sites||[];
    if(!sites.length){ root.appendChild(el('p','empty','No stored service levels for this Gateway.')); }
    else{
      var tb=el('table'); var thead=el('thead'); var tr=el('tr');
      ['Site','Score','Status','Weakest metric','APs offline'].forEach(function(x,i){ tr.appendChild(el('th',i===3||i===4?'hide-sm':null,x)); });
      thead.appendChild(tr); tb.appendChild(thead); var body=el('tbody');
      sites.forEach(function(s){
        var r=el('tr'); r.appendChild(el('td',null,val(s.site)));
        var sc=el('td','num',s.overall===null?'not measured':s.overall+'%');
        if(s.overall!==null){ var bar=el('span','bar'); var fill=el('i'); fill.style.width=Math.max(0,Math.min(100,s.overall))+'%'; fill.style.background='var(--'+cls(s.status)+')'; bar.appendChild(fill); sc.appendChild(bar); }
        r.appendChild(sc);
        var st=el('td'); st.appendChild(el('span','pill '+cls(s.status),s.status?String(s.status).replace(/_/g,' '):'no data')); r.appendChild(st);
        r.appendChild(el('td','hide-sm',s.weakestMetric||'—'));
        r.appendChild(el('td','num hide-sm',s.apsOffline===null||s.apsOffline===undefined?'—':s.apsOffline));
        body.appendChild(r);
      });
      tb.appendChild(body); root.appendChild(tb);
    }
    if(d.alerts&&d.alerts.length){
      var a=el('div','alerts'); a.appendChild(el('h1',null,'Open infrastructure alerts'));
      var ul=el('ul'); d.alerts.forEach(function(x){ var li=el('li'); li.appendChild(el('span','pill '+(x.severity==='critical'?'poor':x.severity==='warning'?'fair':'none'),x.severity)); li.appendChild(document.createTextNode(' '+val(x.title)+(x.target?' — '+val(x.target):''))); ul.appendChild(li); });
      a.appendChild(ul); root.appendChild(a);
    }
    resize();
  }
  window.addEventListener('message',function(ev){
    var m=ev.data; if(!m||m.jsonrpc!=='2.0') return;
    if(m.method==='ui/notifications/tool-result'){ var p=m.params||{}; render(p.structuredContent|| (function(){ try{ return JSON.parse(p.content&&p.content[0]&&p.content[0].text); }catch(e){ return null; } })()); return; }
    if(m.method==='ui/notifications/host-context-changed'){ var th=m.params&&m.params.theme; if(th) document.documentElement.setAttribute('data-theme',th); return; }
    if(m.id!==undefined&&m.method){ send({jsonrpc:'2.0',id:m.id,result:{}}); return; }
    if(m.id!==undefined&&m.result&&m.result.hostContext&&m.result.hostContext.theme){ document.documentElement.setAttribute('data-theme',m.result.hostContext.theme); }
    if(m.id===1&&(m.result||m.error)){ notify('ui/notifications/initialized'); resize(); }
  });
  if('ResizeObserver' in window){ new ResizeObserver(resize).observe(document.body); }
  request('ui/initialize',{appInfo:{name:'AURA network health',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'});
})();
</script></body></html>`;

export const DASHBOARD_RESOURCE = {
  uri: DASHBOARD_URI,
  name: 'dashboard',
  title: 'AURA network health card',
  description: 'MCP App UI for show_dashboard.',
  mimeType: MCP_APP_MIME,
  read: () => DASHBOARD_HTML,
  // Self-contained: no remote scripts, styles or fetches.
  meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
};

export const DASHBOARD_TOOL = {
  name: 'show_dashboard',
  title: 'Network health dashboard',
  description:
    'Show the estate health dashboard: per-site service-level scores worst first, offline APs per site, and open infrastructure alerts. Renders as an interactive card in hosts that support MCP Apps; returns the same data as JSON otherwise. Use when the user asks to SEE the network health or wants a summary view.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  _meta: { ui: { resourceUri: DASHBOARD_URI }, 'ui/resourceUri': DASHBOARD_URI },
  handler: async (_args, ctx) => {
    const [sitesRes, apsRes, src] = await Promise.all([
      ctx.session.get('/v3/sites'),
      ctx.session.get('/v1/aps/query'),
      ctx.sourceIdsFor(ctx.controllerUrl).catch(() => null),
    ]);
    const nameById = new Map(
      (sitesRes.ok && Array.isArray(sitesRes.data) ? sitesRes.data : []).map((s) => [
        String(s.id),
        s.siteName ?? s.name,
      ])
    );
    const aps = apsRes.ok && Array.isArray(apsRes.data) ? apsRes.data : null;
    const offlineBySite = new Map();
    for (const a of aps ?? []) {
      if (isNotReporting(a))
        offlineBySite.set(a.hostSite, (offlineBySite.get(a.hostSite) ?? 0) + 1);
    }
    const sle =
      src?.ok && src.sourceIds.length ? await serviceLevels({ sourceIds: src.sourceIds }) : null;
    const alerts = await infrastructureAlerts({ limit: 6 }).catch(() => null);

    const sites = (sle?.ok ? sle.sites : []).map((s) => {
      const name = nameById.get(String(s.siteId)) ?? `site id ${s.siteId}`;
      return {
        site: untrusted(name),
        overall: s.overall,
        status: s.overallStatus ?? null,
        weakestMetric: s.weakestMetric
          ? `${s.weakestMetric.label} ${s.weakestMetric.successRate}%`
          : null,
        apsOffline: aps ? (offlineBySite.get(name) ?? 0) : null,
      };
    });
    const offline = aps ? aps.filter(isNotReporting).length : null;
    let gatewayHost = ctx.gateway?.name ?? null;
    if (!gatewayHost) {
      try {
        gatewayHost = new URL(ctx.controllerUrl).host;
      } catch {
        gatewayHost = null;
      }
    }
    return {
      basis: 'observed',
      gateway: untrusted(gatewayHost),
      generatedAt: new Date().toISOString(),
      totals: {
        sitesScored: sites.filter((s) => s.overall !== null).length,
        poorSites: sites.filter((s) => s.status === 'poor').length,
        apsConnected: aps ? aps.length - offline : null,
        apsOffline: offline,
        alertsCritical: alerts?.ok ? alerts.counts.critical : null,
        alertsWarning: alerts?.ok ? alerts.counts.warning : null,
      },
      sites,
      alerts: alerts?.ok
        ? alerts.alerts.map((a) => ({
            severity: a.severity,
            title: untrusted(a.message ?? a.checkName),
            check: a.checkName ?? null,
            occurrences: a.occurrences ?? null,
            target: untrusted(typeof a.target === 'string' ? a.target : null),
          }))
        : [],
      ...(sle?.ok
        ? {}
        : { note: 'Stored service levels are unavailable for this Gateway; AP counts are live.' }),
    };
  },
};
