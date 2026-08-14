// ==UserScript==
// @name         C4143 DV-Scale Rack Test Status Dashboard
// @namespace    local.ado.dvscale.dashboard
// @version      1.8.2
// @description  Adds sticky one-row dashboard cards, synchronized Rack 1 Test Feature tables, Excel export, and GitHub-hosted updates.
// @homepageURL  https://github.com/alan512627/azure-devops-state-monitoring
// @supportURL   https://github.com/alan512627/azure-devops-state-monitoring/issues
// @updateURL    https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js
// @downloadURL  https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js
// @match        https://azurecsi.visualstudio.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* ------------------------------------------------------------------
 How to use
  1) Install Tampermonkey, import this file, then open (bookmark it; #dvdash is optional):
     https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash
    Every open or F5 refresh re-runs the query and redraws the dashboard.

 2) Data source modes (dropdown at the top left; your choice is saved in localStorage):
    a. Live query (default): reads through the same-origin REST API with your existing browser session. Always current.
    b. Offline snapshot: no network. Reads the snapshot saved automatically after the last successful load (localStorage),
       or the data embedded in a file produced by "Export offline snapshot .html".
    c. Local proxy: sends API requests to a custom URL (default http://localhost:8080),
       useful when the dashboard is hosted on another domain or opened as a local file (the Azure DevOps API does not allow CORS).

 3) Local proxy example (Node.js 18+; save as proxy.js, set the ADO_PAT environment variable, then run node proxy.js):
    const http = require("http");
    const ORG = "https://azurecsi.visualstudio.com";
    const PAT = process.env.ADO_PAT || "";
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
                   "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    http.createServer((req, res) => {
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      let body = ""; req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const r = await fetch(ORG + req.url, {
            method: req.method,
            headers: { "Content-Type": "application/json",
                       Authorization: "Basic " + Buffer.from(":" + PAT).toString("base64") },
            body: req.method === "POST" ? body : undefined });
          const text = await r.text();
          res.writeHead(r.status, Object.assign({ "Content-Type": "application/json" }, cors));
          res.end(text);
        } catch (e) { res.writeHead(500, cors); res.end(JSON.stringify({ error: String(e) })); }
      });
    }).listen(8080, () => console.log("proxy on http://localhost:8080"));
    Note: create the PAT yourself in Azure DevOps (Scope: Work Items -> Read). Never store it inside this file.

 This script only reads (GET/POST wiql, workitemsbatch) and displays the result. It never modifies any work item.
------------------------------------------------------------------ */
(function () {
  "use strict";
  var isDashboardEntry = location.hash.indexOf("dvdash") >= 0 ||
    /^\/_apis\/projects\/?$/i.test(location.pathname);
  if (!isDashboardEntry) return;
  var D = {};
  D.CFG = {"org":"https://azurecsi.visualstudio.com","project":"Dev","queryId":"9254024e-6a97-44ed-953b-1aa07d38fb48","queryUrl":"https://azurecsi.visualstudio.com/Dev/_queries/query/9254024e-6a97-44ed-953b-1aa07d38fb48/"};
  D.STATE_COLORS = {"Not Started":"#94a3b8","New":"#60a5fa","Proposed":"#f5b544","Design":"#a78bfa","In Progress":"#818cf8","Active":"#818cf8","Ready":"#38bdf8","Committed":"#22d3ee","Passed":"#34d399","Closed":"#2dd4bf","Done":"#2dd4bf","Completed":"#2dd4bf","Failed":"#f87171","Blocked":"#fb7185","Removed":"#9ca3af","Resolved":"#22d3ee","Paused":"#fbbf24"};
  D.TYPE_COLORS = {"Epic":"#c084fc","Feature":"#38bdf8","System Requirement":"#fbbf24","Test Case":"#34d399","User Story":"#818cf8","Task":"#60a5fa","Bug":"#fb7185","Issue":"#fb923c"};
  D.STATE_ORDER = ["Not Started","New","Proposed","Design","Ready","Committed","Active","In Progress","Paused","Blocked","Failed","Passed","Resolved","Closed","Done","Completed","Removed"];
  D.RANGES = [["all","All time"],["1","Last 1 day"],["3","Last 3 days"],["7","Last 7 days"],["30","Last 30 days"],["60","Last 60 days"]];
  D.FIELD_SPECS = {
    priority: { fallback: 'Microsoft.VSTS.Common.Priority', aliases: ['Case Priority', 'Priority'] },
    severity: { fallback: 'Microsoft.VSTS.Common.Severity', aliases: ['Bug Severity', 'Severity'] },
    sampleSize: { aliases: ['Sample Size', 'Test Sample Size', 'Sample Count', 'Samples'] },
    numberOfCycles: { fallback: 'Custom.Number_of_cycles', aliases: ['Number_of_cycles', 'Number of cycles', 'Number of Cycles'] },
    testDuration: { aliases: ['Test Duration', 'Estimated Test Duration', 'Duration', 'Test Time'] },
    scriptType: { aliases: ['Script type', 'Script Type'] },
    crcSdk: { aliases: ['CRC SDK', 'CRC SDK Version'] },
    igsOwner: { aliases: ['IGS Owner'] },
    comments: { aliases: ['Comments', 'Comment'] }
  };
  D.S = {racks:[],loadedAt:null,range:"all",chartType:"pie",panels:[],active:0,mode:"live"};
  D.el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  D.svg = function (t, a) { var e = document.createElementNS('http://www.w3.org/2000/svg', t); for (var k in a) e.setAttribute(k, a[k]); return e; };
  D.colorFor = function (s) { return D.STATE_COLORS[s] || '#cbd5e1'; };
  D.orderStates = function (keys) {
    var known = D.STATE_ORDER.filter(function (s) { return keys.indexOf(s) >= 0; });
    return known.concat(keys.filter(function (s) { return D.STATE_ORDER.indexOf(s) < 0; }).sort());
  };
  D.chip = function (name, count) { var c = D.el('span', 'chip'); c.style.background = D.colorFor(name); c.textContent = count == null ? name : name + ' ' + count; return c; };
  D.typeColor = function (type) { return D.TYPE_COLORS[type] || '#94a3b8'; };
  D.rgba = function (hex, alpha) {
    var value = String(hex || '#94a3b8').replace('#', '');
    if (value.length === 3) value = value.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(value, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  };
  D.typeBadge = function (type) {
    var badge = D.el('span', 'type type-badge', type);
    var color = D.typeColor(type);
    badge.style.color = color;
    badge.style.borderColor = D.rgba(color, .55);
    badge.style.background = D.rgba(color, .12);
    return badge;
  };
  D.decorateBlock = function (el, type, state) {
    var typeColor = D.typeColor(type), stateColor = D.colorFor(state);
    el.style.borderLeft = '4px solid ' + typeColor;
    el.style.background = 'linear-gradient(90deg,' + D.rgba(typeColor, .12) + ' 0%,' + D.rgba(stateColor, .08) + ' 58%,rgba(15,26,46,.98) 100%)';
    el.setAttribute('data-work-item-type', type || 'Unknown');
    el.setAttribute('data-state', state || 'Unknown');
    return el;
  };
  D.wiUrl = function (id) { return D.CFG.org + '/' + D.CFG.project + '/_workitems/edit/' + id; };
  D.fmt = function (iso) { if (!iso) return '-'; var d = new Date(iso); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  D.setStatus = function (html, kind) {
    var b = document.getElementById('banner'); if (!b) return;
    clearTimeout(D._statusFadeTimer); clearTimeout(D._statusHideTimer);
    kind = kind || 'info';
    b.className = 'banner ' + kind; b.innerHTML = html;
    b.classList.remove('hide', 'fading');
    if (kind !== 'err') {
      D._statusFadeTimer = setTimeout(function () { b.classList.add('fading'); }, 4500);
      D._statusHideTimer = setTimeout(function () { b.classList.add('hide'); }, 5200);
    }
  };
  D.apiFetch = async function (url, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    var init = { method: opts.method || 'GET', headers: headers };
    var pat = localStorage.getItem('adoDashPat');
    if (D.S.mode === 'proxy') { init.credentials = 'omit'; if (pat) headers['Authorization'] = 'Basic ' + btoa(':' + pat); }
    else { init.credentials = 'include'; }
    if (opts.body) init.body = opts.body;
    var res = await fetch(url, init);
    if (res.status === 401 || res.status === 203 || res.status === 302) throw new Error('AUTH');
    if (!res.ok) {
      var errorText = '';
      try { errorText = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 240); } catch (readError) { }
      throw new Error('HTTP ' + res.status + (errorText ? ': ' + errorText : ''));
    }
    if ((res.headers.get('content-type') || '').indexOf('json') < 0) throw new Error('AUTH');
    return res.json();
  };
  D.normalizeFieldName = function (value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  };
  D.displayFieldValue = function (value) {
    if (value == null || value === '') return '-';
    if (Array.isArray(value)) return value.map(D.displayFieldValue).join(', ');
    if (typeof value === 'object') value = value.displayName || value.name || value.uniqueName || value.mail || JSON.stringify(value);
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '-';
  };
  D.discoverMetricFields = async function (base) {
    var map = {}, specs = D.FIELD_SPECS;
    Object.keys(specs).forEach(function (key) { map[key] = specs[key].fallback || null; });
    D.S.metricFieldWarning = '';
    try {
      var response = await D.apiFetch(base + '/' + D.CFG.project + '/_apis/wit/fields?api-version=6.0');
      var definitions = response.value || [];
      Object.keys(specs).forEach(function (key) {
        var aliases = specs[key].aliases.map(D.normalizeFieldName);
        var match = null;
        for (var i = 0; i < aliases.length && !match; i++) {
          match = definitions.filter(function (field) {
            return D.normalizeFieldName(field.name) === aliases[i] || D.normalizeFieldName(field.referenceName) === aliases[i];
          })[0] || null;
        }
        if (match && match.referenceName) map[key] = match.referenceName;
      });
      var missing = Object.keys(specs).filter(function (key) { return !map[key]; });
      if (missing.length) D.S.metricFieldWarning = 'Custom fields not found: ' + missing.join(', ');
    } catch (fieldError) {
      D.S.metricFieldWarning = 'Field discovery failed: ' + String((fieldError && fieldError.message) || fieldError);
    }
    return map;
  };
  D.fieldValue = function (fields, referenceName) {
    if (!referenceName || !fields || fields[referenceName] == null || fields[referenceName] === '') return null;
    return fields[referenceName];
  };
  D.runQuery = async function () {
    D.S.bugLinkWarning = '';
    var base = D.baseFor();
    var wiql = await D.apiFetch(base + '/' + D.CFG.project + '/_apis/wit/wiql/' + D.CFG.queryId + '?api-version=6.0&$top=5000');
    var rels = wiql.workItemRelations || [];
    var ids = [], seen = {};
    rels.forEach(function (r) { [r.source, r.target].forEach(function (x) { if (x && !seen[x.id]) { seen[x.id] = 1; ids.push(x.id); } }); });
    (wiql.workItems || []).forEach(function (w) { if (!seen[w.id]) { seen[w.id] = 1; ids.push(w.id); } });
    var baseFields = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.Tags', 'System.ChangedDate', 'System.CreatedDate', 'System.AssignedTo'];
    D.S.metricFields = await D.discoverMetricFields(base);
    var extraFields = Object.keys(D.S.metricFields).map(function (key) { return D.S.metricFields[key]; }).filter(Boolean);
    var fields = baseFields.concat(extraFields.filter(function (field, index, list) { return baseFields.indexOf(field) < 0 && list.indexOf(field) === index; }));
    async function fetchCore(requestFields) {
      var result = [];
      for (var i = 0; i < ids.length; i += 200) {
        var batch = await D.apiFetch(base + '/' + D.CFG.project + '/_apis/wit/workitemsbatch?api-version=6.0',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(i, i + 200), fields: requestFields }) });
        result = result.concat(batch.value || []);
      }
      return result;
    }
    var items = [];
    try {
      items = await fetchCore(fields);
    } catch (metricFieldError) {
      if (fields.length === baseFields.length) throw metricFieldError;
      D.S.metricFieldWarning = 'Custom metric fields were skipped: ' + String((metricFieldError && metricFieldError.message) || metricFieldError);
      fields = baseFields;
      items = await fetchCore(fields);
    }
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it.fields; });
    var linkedIdsOf = {}, linkedFetchIds = [], linkedSeen = {};
    try {
      var testCaseIds = items.filter(function (it) {
        return it.fields && it.fields['System.WorkItemType'] === 'Test Case';
      }).map(function (it) { return it.id; });
      for (var j = 0; j < testCaseIds.length; j += 200) {
        var relationBatch = await D.apiFetch(base + '/' + D.CFG.project + '/_apis/wit/workitemsbatch?api-version=6.0',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: testCaseIds.slice(j, j + 200), '$expand': 'relations', errorPolicy: 'omit' }) });
        (relationBatch.value || []).forEach(function (it) {
          (it.relations || []).forEach(function (rel) {
            var m = /\/workItems\/(\d+)(?:\?|$)/i.exec(rel.url || '');
            if (!m) return;
            var linkedId = +m[1];
            if (linkedId === it.id) return;
            (linkedIdsOf[it.id] = linkedIdsOf[it.id] || []).push(linkedId);
            if (!byId[linkedId] && !linkedSeen[linkedId]) { linkedSeen[linkedId] = 1; linkedFetchIds.push(linkedId); }
          });
        });
      }
      for (var k = 0; k < linkedFetchIds.length; k += 200) {
        var linkedBatch = await D.apiFetch(base + '/' + D.CFG.project + '/_apis/wit/workitemsbatch?api-version=6.0',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: linkedFetchIds.slice(k, k + 200), fields: fields, errorPolicy: 'omit' }) });
        (linkedBatch.value || []).forEach(function (it) { byId[it.id] = it.fields; });
      }
    } catch (bugLinkError) {
      linkedIdsOf = {};
      D.S.bugLinkWarning = String((bugLinkError && bugLinkError.message) || bugLinkError);
    }
    var childrenOf = {}, parentOf = {};
    rels.forEach(function (r) {
      if (r.source && r.target && (!r.rel || r.rel === 'System.LinkTypes.Hierarchy-Forward')) {
        (childrenOf[r.source.id] = childrenOf[r.source.id] || []).push(r.target.id);
        parentOf[r.target.id] = r.source.id;
      }
    });
    function build(id) {
      var f = byId[id] || {};
      return { id: id, type: f['System.WorkItemType'] || '?', title: f['System.Title'] || ('#' + id), state: f['System.State'] || '?',
        tags: f['System.Tags'] || '', changed: f['System.ChangedDate'] || null,
        assigned: (f['System.AssignedTo'] && f['System.AssignedTo'].displayName) || '',
        metrics: {
          priority: D.fieldValue(f, D.S.metricFields && D.S.metricFields.priority),
          sampleSize: D.fieldValue(f, D.S.metricFields && D.S.metricFields.sampleSize),
          numberOfCycles: D.fieldValue(f, D.S.metricFields && D.S.metricFields.numberOfCycles),
          testDuration: D.fieldValue(f, D.S.metricFields && D.S.metricFields.testDuration)
        },
        suiteFields: {
          scriptType: D.fieldValue(f, D.S.metricFields && D.S.metricFields.scriptType),
          crcSdk: D.fieldValue(f, D.S.metricFields && D.S.metricFields.crcSdk),
          igsOwner: D.fieldValue(f, D.S.metricFields && D.S.metricFields.igsOwner),
          comments: D.fieldValue(f, D.S.metricFields && D.S.metricFields.comments)
        },
        bugs: (linkedIdsOf[id] || []).filter(function (linkedId) {
          return byId[linkedId] && byId[linkedId]['System.WorkItemType'] === 'Bug';
        }).filter(function (linkedId, index, list) { return list.indexOf(linkedId) === index; }).map(function (linkedId) {
          var bug = byId[linkedId] || {};
          return {
            id: linkedId, title: bug['System.Title'] || ('Bug #' + linkedId), state: bug['System.State'] || '?',
            severity: D.fieldValue(bug, D.S.metricFields && D.S.metricFields.severity),
            priority: D.fieldValue(bug, D.S.metricFields && D.S.metricFields.priority)
          };
        }),
        children: (childrenOf[id] || []).map(build) };
    }
    var rackIds = ids.filter(function (id) {
      var f = byId[id]; if (!f || f['System.WorkItemType'] !== 'Feature') return false;
      if (!/rack\s*#?\s*\d+/i.test(f['System.Title'] || '')) return false;
      var p = parentOf[id]; return !p || (byId[p] && byId[p]['System.WorkItemType'] === 'Epic');
    });
    var racks = rackIds.map(build);
    racks.forEach(function (r) { var m = /rack\s*#?\s*(\d+)/i.exec(r.title); r.num = m ? +m[1] : 999; r.label = m ? 'Rack ' + m[1] : r.title; });
    racks.sort(function (a, b) { return a.num - b.num; });
    return { racks: racks, count: ids.length };
  };
  D.collect = function (node, type, out) { out = out || []; if (node.type === type) out.push(node); (node.children || []).forEach(function (c) { D.collect(c, type, out); }); return out; };
  D.inRange = function (c) { var v = D.S.range; if (v === 'all') return true; if (!c.changed) return false; return (Date.now() - new Date(c.changed).getTime()) <= parseInt(v, 10) * 86400000; };
  D.countStates = function (cases) { var m = {}; cases.forEach(function (c) { m[c.state] = (m[c.state] || 0) + 1; }); return m; };
  D.sum = function (m) { var t = 0; for (var k in m) t += m[k]; return t; };
  D.uniqueBugs = function (cases) {
    var seen = {}, bugs = [];
    cases.forEach(function (c) { (c.bugs || []).forEach(function (bug) { if (!seen[bug.id]) { seen[bug.id] = 1; bugs.push(bug); } }); });
    return bugs;
  };
  D.rate = function (count, total) {
    return total ? (count * 100 / total).toFixed(1) + '%' : '-';
  };
  D.outcomeSummary = function (cases) {
    var summary = { total: cases.length, pass: 0, fail: 0, inProgress: 0 };
    cases.forEach(function (c) {
      var state = String(c.state || '').trim().toLowerCase();
      if (state === 'closed') summary.pass++;
      else if (state === 'blocked') summary.fail++;
      else if (state === 'in progress') summary.inProgress++;
    });
    summary.passRate = D.rate(summary.pass, summary.total);
    summary.failRate = D.rate(summary.fail, summary.total);
    return summary;
  };
  D.hasMetric = function (value) {
    return value != null && String(value).trim() !== '';
  };
  D.priorityLevel = function (value) {
    var match = /(?:^|\D)([1-4])(?:\D|$)/.exec(String(value == null ? '' : value));
    return match ? +match[1] : null;
  };
  D.severityInfo = function (value) {
    var level = D.priorityLevel(value);
    var labels = { 1: '1 - Critical', 2: '2 - High', 3: '3 - Medium', 4: '4 - Low' };
    return { level: level, label: labels[level] || (D.hasMetric(value) ? String(value) : 'Unknown') };
  };
  D.metricBadge = function (label, value, color) {
    var badge = D.el('span', 'metric-badge', label + ': ' + value);
    badge.style.color = color; badge.style.borderColor = D.rgba(color, .55); badge.style.background = D.rgba(color, .11);
    return badge;
  };
  D.caseLinks = function (cases) {
    var wrap = D.el('span', 'case-links');
    cases.forEach(function (testCase, index) {
      if (index) wrap.appendChild(document.createTextNode(', '));
      var link = D.el('a', 'caseid', '#' + testCase.id); link.href = D.wiUrl(testCase.id); link.target = '_blank'; link.rel = 'noopener';
      link.title = testCase.title; wrap.appendChild(link);
    });
    return wrap;
  };
  D.itemLinks = function (items, kind) {
    var wrap = D.el('div', 'hbar-links');
    items.forEach(function (item) {
      if (kind === 'bug') wrap.appendChild(D.bugLink(item));
      else {
        var link = D.el('a', 'caseid', '#' + item.id);
        link.href = D.wiUrl(item.id); link.target = '_blank'; link.rel = 'noopener'; link.title = item.title || ('Test Case #' + item.id);
        wrap.appendChild(link);
      }
    });
    return wrap;
  };
  D.idDropdown = function (items, kind) {
    if (!items.length) return null;
    var details = D.el('details', 'hbar-details');
    details.appendChild(D.el('summary', null, (kind === 'bug' ? 'Bug IDs' : 'Case IDs') + ' (' + items.length + ')'));
    details.appendChild(D.itemLinks(items, kind));
    return details;
  };
  D.countLabel = function (count, noun) {
    return count + ' ' + noun + (count === 1 ? '' : 's');
  };
  D.horizontalBarChart = function (title, rows, emptyText) {
    var section = D.el('section', 'metric-section');
    section.appendChild(D.el('h4', null, title));
    if (!rows.length) {
      section.appendChild(D.el('div', 'empty', emptyText || 'No data available'));
      return section;
    }
    var list = D.el('div', 'hbar-list');
    rows.forEach(function (row) {
      var item = D.el('div', 'hbar-row' + (row.total ? ' total' : ''));
      var head = D.el('div', 'hbar-head');
      head.appendChild(D.el('span', 'hbar-label', row.label));
      head.appendChild(D.el('span', 'hbar-value', row.valueText));
      item.appendChild(head);
      var track = D.el('div', 'hbar-track'), fill = D.el('div', 'hbar-fill');
      var width = Math.max(0, Math.min(100, +row.percent || 0));
      fill.style.width = width + '%'; fill.style.background = row.color || '#38bdf8';
      if (width > 0 && width < 1) fill.style.minWidth = '3px';
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', row.label + ': ' + row.valueText);
      track.appendChild(fill); item.appendChild(track);
      var dropdown = D.idDropdown(row.items || [], row.kind || 'case');
      if (dropdown) item.appendChild(dropdown);
      list.appendChild(item);
    });
    section.appendChild(list); return section;
  };
  D.priorityCompletionChart = function (cases) {
    var groups = { 1: [], 2: [], 3: [], 4: [], unknown: [] };
    cases.forEach(function (testCase) {
      var level = D.priorityLevel(testCase.metrics && testCase.metrics.priority);
      (level ? groups[level] : groups.unknown).push(testCase);
    });
    if (!cases.length) return D.horizontalBarChart('Case Priority completion', [], 'No Test Cases in the selected time range');
    var rows = [], totalClosed = 0;
    [1, 2, 3, 4].forEach(function (key) {
      var list = groups[key];
      var closed = list.filter(function (testCase) { return String(testCase.state || '').toLowerCase() === 'closed'; }).length;
      totalClosed += closed;
      rows.push({ label: 'P' + key, valueText: list.length ? (closed + ' / ' + list.length + ' Closed · ' + D.rate(closed, list.length)) : '0 cases', percent: list.length ? closed * 100 / list.length : 0, items: list, color: '#2dd4bf' });
    });
    if (groups.unknown.length) {
      var unknownClosed = groups.unknown.filter(function (testCase) { return String(testCase.state || '').toLowerCase() === 'closed'; }).length;
      totalClosed += unknownClosed;
      rows.push({ label: 'Not set', valueText: unknownClosed + ' / ' + groups.unknown.length + ' Closed · ' + D.rate(unknownClosed, groups.unknown.length), percent: unknownClosed * 100 / groups.unknown.length, items: groups.unknown, color: '#94a3b8' });
    }
    rows.push({ label: 'All priorities', valueText: totalClosed + ' / ' + cases.length + ' Closed · ' + D.rate(totalClosed, cases.length), percent: totalClosed * 100 / cases.length, items: cases, color: '#38bdf8', total: true });
    return D.horizontalBarChart('Case Priority completion', rows);
  };
  D.numericRank = function (value) {
    var match = /-?\d+(?:\.\d+)?/.exec(String(value == null ? '' : value).replace(/,/g, ''));
    return match ? +match[0] : -Infinity;
  };
  D.durationRank = function (value) {
    if (typeof value === 'number') return value;
    var text = String(value == null ? '' : value).toLowerCase(), total = 0, foundUnit = false;
    var re = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/g, match;
    while ((match = re.exec(text))) {
      foundUnit = true;
      var n = +match[1], unit = match[2];
      if (/^(d|day)/.test(unit)) total += n * 86400;
      else if (/^(h|hr|hour)/.test(unit)) total += n * 3600;
      else if (/^(m|min|minute)/.test(unit)) total += n * 60;
      else total += n;
    }
    return foundUnit ? total : D.numericRank(value);
  };
  D.metricInventoryChart = function (cases, key, label, ranker, color, showCoverage) {
    var groups = {};
    cases.forEach(function (testCase) {
      var value = testCase.metrics && testCase.metrics[key]; if (!D.hasMetric(value)) return;
      var text = String(value).trim();
      (groups[text] = groups[text] || []).push(testCase);
    });
    var keys = Object.keys(groups).sort(function (a, b) {
      var delta = ranker(b) - ranker(a); return delta || a.localeCompare(b);
    });
    var total = keys.reduce(function (sum, keyName) { return sum + groups[keyName].length; }, 0);
    var rows = keys.map(function (keyName) {
      var count = groups[keyName].length, share = total ? count * 100 / total : 0;
      return { label: keyName, valueText: D.countLabel(count, 'case') + ' · ' + share.toFixed(1) + '%', percent: share, items: groups[keyName], color: color };
    });
    var title = showCoverage
      ? label + ' (' + total + ' set / ' + (cases.length - total) + ' empty · ' + cases.length + ' total)'
      : label + ' (' + total + ' cases)';
    return D.horizontalBarChart(title, rows, 'No ' + label + ' values found');
  };
  D.metricInventoryPanel = function (cases) {
    var grid = D.el('div', 'metric-grid');
    var left = D.el('div', 'metric-stack');
    left.appendChild(D.metricInventoryChart(cases, 'sampleSize', 'Sample Size', D.numericRank, '#38bdf8'));
    left.appendChild(D.metricInventoryChart(cases, 'numberOfCycles', 'Number_of_cycles', D.numericRank, '#a78bfa', true));
    grid.appendChild(left);
    grid.appendChild(D.metricInventoryChart(cases, 'testDuration', 'Test Duration', D.durationRank, '#fbbf24'));
    return grid;
  };
  D.bugPrioritySeverityChart = function (bugs, priorityKey) {
    var priorityBugs = bugs.filter(function (bug) {
      var level = D.priorityLevel(bug.priority);
      return priorityKey === 'unknown' ? !level : level === priorityKey;
    });
    var groups = { 1: [], 2: [], 3: [], 4: [], unknown: [] };
    priorityBugs.forEach(function (bug) {
      var level = D.severityInfo(bug.severity).level;
      (level ? groups[level] : groups.unknown).push(bug);
    });
    var severityLabels = { 1: '1 - Critical', 2: '2 - High', 3: '3 - Medium', 4: '4 - Low' };
    var severityColors = { 1: '#fb7185', 2: '#fb923c', 3: '#fbbf24', 4: '#60a5fa', unknown: '#94a3b8' };
    var rows = [];
    [1, 2, 3, 4, 'unknown'].forEach(function (key) {
      var list = groups[key]; if (!list.length && key === 'unknown') return;
      var share = priorityBugs.length ? list.length * 100 / priorityBugs.length : 0;
      rows.push({
        label: key === 'unknown' ? 'Severity not set' : severityLabels[key],
        valueText: D.countLabel(list.length, 'bug') + ' · ' + share.toFixed(1) + '%',
        percent: share,
        items: list,
        kind: 'bug',
        color: severityColors[key]
      });
    });
    var title = priorityKey === 'unknown' ? 'Priority not set' : 'Priority P' + priorityKey;
    return D.horizontalBarChart(title + ' (' + D.countLabel(priorityBugs.length, 'bug') + ')', rows);
  };
  D.bugStats = function (cases) {
    var bugs = D.uniqueBugs(cases), wrap = D.el('div');
    wrap.appendChild(D.el('div', 'metric-total', 'Total unique Bugs: ' + bugs.length));
    var allBugIds = D.idDropdown(bugs, 'bug'); if (allBugIds) wrap.appendChild(allBugIds);
    wrap.appendChild(D.el('div', 'small', 'Severity percentages are calculated within each Bug Priority.'));
    var grid = D.el('div', 'metric-grid bug-priority-grid');
    [1, 2, 3, 4].forEach(function (priority) { grid.appendChild(D.bugPrioritySeverityChart(bugs, priority)); });
    if (bugs.some(function (bug) { return !D.priorityLevel(bug.priority); })) grid.appendChild(D.bugPrioritySeverityChart(bugs, 'unknown'));
    wrap.appendChild(grid); return wrap;
  };
  D.arcPath = function (cx, cy, R, r, a0, a1) {
    var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    var x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
    var x3 = cx + r * Math.cos(a0), y3 = cy + r * Math.sin(a0);
    var lg = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + x1 + ' ' + y1 +
      ' L' + x2 + ' ' + y2 + ' A' + r + ' ' + r + ' 0 ' + lg + ' 0 ' + x3 + ' ' + y3 + ' Z';
  };
  D.pie = function (counts) {
    var size = 300, keys = D.orderStates(Object.keys(counts)), total = D.sum(counts);
    var s = D.svg('svg', { viewBox: '0 0 ' + size + ' ' + size, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' });
    var cx = size / 2, cy = size / 2, R = size / 2 - 10, r = R * 0.58;
    if (!total) {
      s.appendChild(D.svg('circle', { cx: cx, cy: cy, r: R, fill: '#16243d' }));
      var t0 = D.svg('text', { x: cx, y: cy + 5, fill: '#8fa3c0', 'text-anchor': 'middle', 'font-size': '14' }); t0.textContent = 'No data in range'; s.appendChild(t0);
      return s;
    }
    if (keys.length === 1) {
      s.appendChild(D.svg('circle', { cx: cx, cy: cy, r: R, fill: D.colorFor(keys[0]) }));
      s.appendChild(D.svg('circle', { cx: cx, cy: cy, r: r, fill: '#111d33' }));
      var tt = D.svg('title'); tt.textContent = keys[0] + ': ' + counts[keys[0]] + ' (100%)'; s.appendChild(tt);
    } else {
      var a = -Math.PI / 2;
      keys.forEach(function (k) {
        var frac = counts[k] / total, a1 = a + frac * Math.PI * 2;
        var p = D.svg('path', { d: D.arcPath(cx, cy, R, r, a, a1), fill: D.colorFor(k), stroke: '#0b1220', 'stroke-width': '2' });
        var ti = D.svg('title'); ti.textContent = k + ': ' + counts[k] + ' (' + (frac * 100).toFixed(1) + '%)';
        p.appendChild(ti); s.appendChild(p);
        if (frac > 0.06) {
          var am = (a + a1) / 2, rr = (R + r) / 2;
          var lb = D.svg('text', { x: cx + rr * Math.cos(am), y: cy + rr * Math.sin(am) + 4, fill: '#0b1220', 'text-anchor': 'middle', 'font-size': '12', 'font-weight': '700' });
          lb.textContent = (frac * 100).toFixed(0) + '%'; s.appendChild(lb);
        }
        a = a1;
      });
    }
    var n1 = D.svg('text', { x: cx, y: cy - 2, fill: '#e2e8f0', 'text-anchor': 'middle', 'font-size': '26', 'font-weight': '700' }); n1.textContent = total;
    var n2 = D.svg('text', { x: cx, y: cy + 16, fill: '#8fa3c0', 'text-anchor': 'middle', 'font-size': '11' }); n2.textContent = 'test cases';
    s.appendChild(n1); s.appendChild(n2);
    return s;
  };
  D.bar = function (counts) {
    var W = 460, H = 300, L = 40, B = 46, T = 14, Rp = 12;
    var keys = D.orderStates(Object.keys(counts)), total = D.sum(counts);
    var s = D.svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' });
    if (!total) { var t0 = D.svg('text', { x: W / 2, y: H / 2, fill: '#8fa3c0', 'text-anchor': 'middle', 'font-size': '14' }); t0.textContent = 'No data in range'; s.appendChild(t0); return s; }
    var max = Math.max.apply(null, keys.map(function (k) { return counts[k]; }));
    var pw = W - L - Rp, ph = H - T - B;
    for (var g = 0; g <= 4; g++) {
      var y = T + ph - ph * g / 4;
      s.appendChild(D.svg('line', { x1: L, y1: y, x2: L + pw, y2: y, stroke: '#1c2942' }));
      var yl = D.svg('text', { x: L - 6, y: y + 4, fill: '#7d93b3', 'text-anchor': 'end', 'font-size': '10' });
      yl.textContent = Math.round(max * g / 4); s.appendChild(yl);
    }
    var slot = pw / keys.length, bw = Math.min(60, slot * 0.6);
    keys.forEach(function (k, i) {
      var v = counts[k], h = ph * v / max, x = L + slot * i + (slot - bw) / 2, y = T + ph - h;
      var rect = D.svg('rect', { x: x, y: y, width: bw, height: Math.max(h, 1), fill: D.colorFor(k), rx: 5 });
      var ti = D.svg('title'); ti.textContent = k + ': ' + v + ' (' + (v * 100 / total).toFixed(1) + '%)'; rect.appendChild(ti);
      s.appendChild(rect);
      var vt = D.svg('text', { x: x + bw / 2, y: y - 5, fill: '#e2e8f0', 'text-anchor': 'middle', 'font-size': '11', 'font-weight': '700' }); vt.textContent = v; s.appendChild(vt);
      var lt = D.svg('text', { x: x + bw / 2, y: T + ph + 16, fill: '#9fb3d0', 'text-anchor': 'middle', 'font-size': '10' });
      lt.textContent = k.length > 12 ? k.slice(0, 11) + '…' : k; s.appendChild(lt);
    });
    return s;
  };
  D.stacked = function (labels, perRack, states) {
    var W = 460, H = 300, L = 40, B = 40, T = 14, Rp = 12;
    var s = D.svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' });
    var totals = perRack.map(function (m) { return D.sum(m); });
    var max = Math.max.apply(null, totals.concat([1]));
    if (!totals.some(function (t) { return t > 0; })) { var t0 = D.svg('text', { x: W / 2, y: H / 2, fill: '#8fa3c0', 'text-anchor': 'middle', 'font-size': '14' }); t0.textContent = 'No data in range'; s.appendChild(t0); return s; }
    var pw = W - L - Rp, ph = H - T - B;
    for (var g = 0; g <= 4; g++) {
      var y = T + ph - ph * g / 4;
      s.appendChild(D.svg('line', { x1: L, y1: y, x2: L + pw, y2: y, stroke: '#1c2942' }));
      var yl = D.svg('text', { x: L - 6, y: y + 4, fill: '#7d93b3', 'text-anchor': 'end', 'font-size': '10' }); yl.textContent = Math.round(max * g / 4); s.appendChild(yl);
    }
    var slot = pw / labels.length, bw = Math.min(56, slot * 0.55);
    labels.forEach(function (lab, i) {
      var x = L + slot * i + (slot - bw) / 2, acc = 0;
      states.forEach(function (st) {
        var v = perRack[i][st] || 0; if (!v) return;
        var h = ph * v / max, y = T + ph - ph * (acc + v) / max;
        var rect = D.svg('rect', { x: x, y: y, width: bw, height: Math.max(h, 1), fill: D.colorFor(st) });
        var ti = D.svg('title'); ti.textContent = lab + ' · ' + st + ': ' + v; rect.appendChild(ti);
        s.appendChild(rect); acc += v;
      });
      var tv = D.svg('text', { x: x + bw / 2, y: T + ph - ph * totals[i] / max - 5, fill: '#e2e8f0', 'text-anchor': 'middle', 'font-size': '11', 'font-weight': '700' });
      tv.textContent = totals[i] || ''; s.appendChild(tv);
      var lt = D.svg('text', { x: x + bw / 2, y: T + ph + 16, fill: '#9fb3d0', 'text-anchor': 'middle', 'font-size': '10' }); lt.textContent = lab; s.appendChild(lt);
    });
    return s;
  };
  D.legend = function (counts) {
    var wrap = D.el('div', 'legend');
    var total = D.sum(counts);
    D.orderStates(Object.keys(counts)).forEach(function (k) {
      var c = D.chip(k, counts[k] + ' (' + (total ? (counts[k] * 100 / total).toFixed(0) : 0) + '%)');
      wrap.appendChild(c);
    });
    return wrap;
  };
  D.CSS = "*{box-sizing:border-box}\nbody{margin:0;font-family:\"Segoe UI\",Roboto,\"Noto Sans TC\",\"Microsoft JhengHei\",sans-serif;background:#0b1220;color:#e2e8f0;font-size:14px}\na{color:#7dd3fc;text-decoration:none}a:hover{text-decoration:underline}\nheader{padding:14px 20px;background:linear-gradient(90deg,#132039,#0d1729);border-bottom:1px solid #1e2b45;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}\nh1{font-size:18px;margin:0 0 4px}\n.sub{font-size:12px;color:#8fa3c0}\n.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 20px;background:#0e1830;border-bottom:1px solid #1e2b45;position:sticky;top:0;z-index:20}\n.controls label{font-size:12px;color:#9fb3d0;display:flex;gap:6px;align-items:center}\nselect,button,input{background:#16243d;color:#e2e8f0;border:1px solid #27395c;border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit}\nbutton{cursor:pointer}button:hover{background:#1e3a5f}\nbutton.primary{background:#2563eb;border-color:#2563eb}button.primary:hover{background:#1d4ed8}\n.tabs{display:flex;flex-wrap:wrap;gap:4px;padding:10px 20px 0}\n.tab{padding:8px 16px;border-radius:8px 8px 0 0;background:#111d33;border:1px solid #1e2b45;border-bottom:none;color:#9fb3d0;cursor:pointer;font-size:13px}\n.tab.active{background:#16243d;color:#fff;font-weight:600;box-shadow:inset 0 3px 0 #38bdf8}\n.panel{display:none;padding:16px 20px 60px}.panel.active{display:block}\n.cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;align-items:center}\n.card{background:#111d33;border:1px solid #1e2b45;border-radius:10px;padding:10px 16px;min-width:110px}\n.card .k{font-size:10px;color:#8fa3c0;letter-spacing:.05em}\n.card .v{font-size:22px;font-weight:700;margin-top:2px}\n.grid{display:grid;grid-template-columns:minmax(300px,1fr) minmax(320px,1.15fr);gap:14px;margin-bottom:16px}\n@media(max-width:980px){.grid{grid-template-columns:1fr}}\n.box{background:#111d33;border:1px solid #1e2b45;border-radius:10px;padding:14px}\n.box h3{margin:0 0 10px;font-size:12px;color:#cbd8ea;letter-spacing:.05em;text-transform:uppercase}\n.chartwrap{height:300px}\n.legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;justify-content:center}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth,td{text-align:left;padding:6px 8px;border-bottom:1px solid #1c2942}\nth{color:#8fa3c0;font-size:10px;text-transform:uppercase;letter-spacing:.05em}\ntr.total td{font-weight:700;border-top:2px solid #27395c;border-bottom:none}\ntd.num,th.num{text-align:right;font-variant-numeric:tabular-nums}\n.chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;color:#0b1220}\n.bar{height:8px;border-radius:4px;background:#1c2942;overflow:hidden;display:flex;min-width:70px}\ndetails.node{border:1px solid #1c2942;border-radius:8px;margin:6px 0;background:#0f1a2e}\ndetails.node[open]{background:#101d33}\ndetails.node>summary{cursor:pointer;padding:8px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;list-style:none}\ndetails.node>summary::-webkit-details-marker{display:none}\ndetails.node>summary:before{content:\"\\25B8\";color:#5b7ba6;font-size:12px;transition:transform .15s}\ndetails.node[open]>summary:before{transform:rotate(90deg)}\ndetails.node>summary:hover{background:#152341}\n.nodebody{padding:2px 10px 10px 24px}\n.ntitle{font-weight:600}\n.lvl1>summary>.ntitle{color:#f0f6ff;font-size:14px}\n.lvl2>summary>.ntitle{color:#cfe3ff;font-size:13px}\n.lvl3>summary>.ntitle{color:#b7cdea;font-size:12.5px;font-weight:500}\n.type{font-size:10px;color:#7d93b3;border:1px solid #27395c;border-radius:4px;padding:1px 5px}\n.spacer{flex:1}\n.caserow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px dashed #1c2942;font-size:13px}\n.caserow:hover{background:#152341}\n.caseid{font-family:Consolas,monospace;font-size:12px;color:#7dd3fc;min-width:64px}\n.casetitle{flex:1;min-width:200px;color:#d7e3f4}\n.date{font-size:11px;color:#7d93b3;font-variant-numeric:tabular-nums}\n.banner{margin:10px 20px;padding:10px 14px;border-radius:8px;font-size:13px;border:1px solid}\n.banner.info{background:#10233d;border-color:#27507f;color:#bcd9ff}\n.banner.warn{background:#3a2a10;border-color:#7a5a1c;color:#ffd9a0}\n.banner.err{background:#3a1620;border-color:#7f2740;color:#ffc2cf}\n.hide{display:none!important}\n.small{font-size:11px;color:#8fa3c0}\n.empty{padding:14px;text-align:center;color:#8fa3c0;font-size:13px}";
  D.CSS += "\n.type-badge{font-weight:700;letter-spacing:.02em}\n.colour-key{display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center;padding-left:8px;border-left:1px solid #27395c}\n.tab{font-size:14px;padding:10px 18px;min-height:40px}\n.banner{position:fixed;right:20px;bottom:20px;z-index:100;max-width:min(680px,calc(100vw - 40px));margin:0;padding:11px 14px;box-shadow:0 14px 36px rgba(0,0,0,.38);opacity:1;transform:translateY(0);transition:opacity .7s ease,transform .7s ease;pointer-events:auto}\n.banner.fading{opacity:0;transform:translateY(10px);pointer-events:none}\n.cards{display:flex;flex-wrap:nowrap;gap:12px;width:100%;align-items:stretch;overflow-x:auto;scrollbar-width:thin}\n.cards>.card{flex:1 1 0;width:auto;min-width:110px;max-width:none;overflow:hidden}\n.card{position:relative;transition:transform .15s,filter .15s}\n.card:hover{transform:translateY(-2px);filter:brightness(1.12)}\n.card .k,.card .v{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tree-toolbar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:66.6667%;max-width:100%;margin-bottom:14px;align-items:center}\n.tree-toolbar>button,.tree-toolbar>input{width:100%;min-width:0}\n.bug-link{display:inline-flex;align-items:center;border:1px solid rgba(248,113,113,.72);border-radius:999px;padding:2px 8px;background:rgba(248,113,113,.14);color:#fecaca;font-size:11px;font-weight:700;white-space:nowrap}\n.bug-link:hover{background:rgba(248,113,113,.25);color:#fff;text-decoration:none}\n.caserow{margin:3px 0;border-radius:6px;border-bottom-color:transparent;transition:filter .15s,transform .15s}\n.caserow:hover{filter:brightness(1.18);transform:translateX(2px)}\ndetails.node{overflow:hidden;transition:filter .15s,border-color .15s}\ndetails.node:hover{filter:brightness(1.08)}\n@media(max-width:720px){.tab{font-size:14px;padding:9px 14px;min-height:38px;flex:1 1 auto}.banner{right:12px;bottom:12px;max-width:calc(100vw - 24px)}.colour-key{width:100%;padding:6px 0 0;border-left:0;border-top:1px solid #27395c}.casetitle{min-width:150px}.tree-toolbar{width:100%;grid-template-columns:repeat(2,minmax(0,1fr))}.tree-toolbar>input{grid-column:1/-1}}";
  D.CSS += "\n.tab{font-size:18px;padding:10px 29px;min-height:42px}\n.metric-badge{display:inline-flex;align-items:center;border:1px solid;border-radius:5px;padding:2px 6px;font-size:10.5px;font-weight:700;white-space:nowrap}\n.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:10px 0 14px}\n.metric-section{min-width:0;padding:10px;border:1px solid #1c2942;border-radius:8px;background:#0f1a2e;overflow-x:auto}\n.metric-section h4{margin:0 0 8px;color:#cfe3ff;font-size:12px}\n.metric-total{font-size:12px;color:#bcd9ff;margin:2px 0 8px;font-weight:700}\n.case-links{display:inline;line-height:1.8}\n@media(max-width:980px){.metric-grid{grid-template-columns:1fr}}\n@media(max-width:720px){.tab{font-size:16px;padding:9px 18px;min-height:40px}}";
  D.CSS += "\n.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}\n.metric-stack{display:grid;gap:12px;align-content:start;min-width:0}\n.metric-section{overflow:hidden}\n.hbar-list{display:grid;gap:10px}\n.hbar-row{padding:9px 10px;border:1px solid #1c2942;border-radius:8px;background:#111d33}\n.hbar-row.total{border-color:#2d527d;background:#12223b}\n.hbar-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}\n.hbar-label{min-width:0;color:#dbeafe;font-size:12px;font-weight:700;overflow-wrap:anywhere}\n.hbar-value{flex:none;color:#a9bdd8;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}\n.hbar-track{height:12px;border-radius:999px;background:#1c2942;overflow:hidden}\n.hbar-fill{height:100%;border-radius:inherit;transition:width .25s ease}\n.hbar-details{margin-top:5px;color:#8fa3c0;font-size:11px}\n.hbar-details>summary{display:flex;align-items:center;min-height:32px;width:max-content;max-width:100%;cursor:pointer;color:#7dd3fc;font-weight:600;list-style:none}\n.hbar-details>summary::-webkit-details-marker{display:none}\n.hbar-details>summary:before{content:'\\25B8';margin-right:5px;color:#5b7ba6;transition:transform .15s}\n.hbar-details[open]>summary:before{transform:rotate(90deg)}\n.hbar-details>summary:hover{color:#bae6fd}\n.hbar-details>summary:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;border-radius:4px}\n.hbar-links{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 2px 16px}\n@media(max-width:980px){.metric-grid{grid-template-columns:1fr}}\n@media(max-width:720px){.hbar-head{align-items:flex-start;flex-direction:column;gap:3px}.hbar-value{text-align:left}.hbar-row{padding:9px}.hbar-details>summary{min-height:40px}.hbar-links{padding-left:8px}}";
  D.CSS += "\n.bug-detail-scroll{max-width:100%;overflow-x:auto;margin-top:8px}\n.bug-detail-scroll>table{min-width:640px}";
  D.CSS += "\n.suite-intro{margin:0 0 12px;color:#9fb3d0;font-size:12px}\n.suite-toolbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;width:min(980px,100%);margin-bottom:14px}\n.suite-toolbar>*{width:100%;min-width:0}\n.feature-groups{display:grid;gap:8px}\ndetails.feature-group{min-width:0;border:1px solid #253858;border-radius:9px;background:#0f1a2e;overflow:hidden}\ndetails.feature-group[open]{border-color:#35618f;background:#101d33}\n.feature-summary{display:flex;align-items:center;gap:8px;padding:11px 13px;cursor:pointer;list-style:none}\n.feature-summary::-webkit-details-marker{display:none}\n.feature-summary:before{content:'\\25B8';color:#7dd3fc;transition:transform .15s}\ndetails.feature-group[open]>.feature-summary:before{transform:rotate(90deg)}\n.feature-summary:hover{background:#152744}\n.feature-group-name{color:#e0f2fe;font-size:15px;font-weight:700}\n.suite-pill{display:inline-flex;padding:2px 8px;border-radius:999px;background:#193657;color:#bae6fd;border:1px solid #2d527d;font-size:11px;font-weight:700}\n.feature-group-body{padding:0 12px 12px 28px}\n.feature-table-scroll{max-width:100%;overflow:auto;border:1px solid #1c2942;border-radius:7px}\ntable.feature-table{min-width:1320px;background:#0c1729}\n.feature-table th{position:sticky;top:0;background:#132039;z-index:1}\n.feature-table td{vertical-align:top;line-height:1.4}\n.feature-table .feature-id{width:86px;font-family:Consolas,monospace}\n.feature-table .feature-title{min-width:420px;color:#d7e3f4}\n.feature-table .feature-owner{min-width:150px}\n.feature-table .feature-comments{min-width:240px;max-width:420px;white-space:normal;overflow-wrap:anywhere}\n.feature-case-row{border-left:3px solid transparent}\n.feature-case-row:hover{background:#152341}\n.feature-bugs{min-width:160px}\n.feature-bugs .bug-link{margin:1px 4px 1px 0}\n@media(max-width:720px){.suite-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}.suite-toolbar>input{grid-column:1/-1}.feature-group-body{padding-left:10px}.feature-summary{padding:12px 10px}}";
  D.CSS += "\n.dashboard-main{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:start;min-width:0}\n#panels{min-width:0}\n.tabs{display:flex;flex-direction:column;flex-wrap:nowrap;align-items:center;gap:4px;width:64px;min-width:64px;padding:10px 6px 60px 8px}\n.tab{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:50px;min-width:50px;max-width:50px;min-height:72px;height:auto;padding:8px 5px;border:1px solid #1e2b45;border-radius:6px;background:#111d33;color:#9fb3d0;writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;font-size:11px;line-height:1.1}\n.tab.active{background:#16243d;color:#fff;font-weight:600;box-shadow:inset 3px 0 0 #38bdf8}\n.panel{min-width:0;padding:16px 20px 60px 14px}\n@media(max-width:720px){.dashboard-main{grid-template-columns:54px minmax(0,1fr)}.tabs{width:54px;min-width:54px;padding:8px 4px 40px}.tab{width:44px;min-width:44px;max-width:44px;min-height:66px;padding:7px 4px;font-size:10px}.panel{padding:12px 10px 50px 8px}}";
  D.CSS += "\n:root{--dvdash-controls-height:52px}\n.tabs{position:sticky;top:calc(var(--dvdash-controls-height) + 8px);align-self:start;z-index:12;max-height:calc(100vh - var(--dvdash-controls-height) - 16px);overflow-y:auto;scrollbar-width:thin}\n.panel-sticky,.suite-sticky{position:sticky;top:var(--dvdash-controls-height);z-index:11;background:#0b1220;padding-top:8px;padding-bottom:12px;box-shadow:0 12px 18px rgba(3,8,18,.42)}\n.panel-sticky>.cards,.suite-sticky>.cards{margin-bottom:0}\n@media(max-width:980px), (max-height:700px){.panel-sticky,.suite-sticky{position:static;box-shadow:none;padding-top:0}}\n@media(max-width:720px){.tabs{top:calc(var(--dvdash-controls-height) + 6px);max-height:calc(100vh - var(--dvdash-controls-height) - 12px)}}";
  D.card = function (k, v, tone) {
    var c = D.el('div', 'card');
    if (tone) {
      c.style.borderLeft = '4px solid ' + tone;
      c.style.background = 'linear-gradient(135deg,' + D.rgba(tone, .17) + ',rgba(17,29,51,.98) 68%)';
    }
    c.appendChild(D.el('div', 'k', k));
    var val = D.el('div', 'v', v == null ? '-' : String(v)); c.appendChild(val); c._val = val;
    return c;
  };
  D.box = function (title) { var b = D.el('div', 'box'); if (title) b.appendChild(D.el('h3', null, title)); return b; };
  D.bugTable = function (cases) {
    var grouped = {};
    cases.forEach(function (testCase) {
      (testCase.bugs || []).forEach(function (bug) {
        if (!grouped[bug.id]) grouped[bug.id] = { bug: bug, cases: [] };
        grouped[bug.id].cases.push(testCase);
      });
    });
    var t = D.el('table'), thead = D.el('thead'), hr = D.el('tr');
    ['Bug', 'State', 'Severity', 'Priority', 'Title', 'Linked Test Cases'].forEach(function (h) { hr.appendChild(D.el('th', null, h)); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = D.el('tbody'), ids = Object.keys(grouped).sort(function (a, b) { return +a - +b; });
    if (!ids.length) {
      var er = D.el('tr'), td = D.el('td', 'empty', 'No linked Bugs found yet. This tracking area is reserved and will populate automatically from Test Case work item Links.');
      td.colSpan = 6; er.appendChild(td); tb.appendChild(er);
    }
    ids.forEach(function (id) {
      var entry = grouped[id], tr = D.el('tr');
      var bugCell = D.el('td'); bugCell.appendChild(D.bugLink(entry.bug)); tr.appendChild(bugCell);
      var stateCell = D.el('td'); stateCell.appendChild(D.chip(entry.bug.state)); tr.appendChild(stateCell);
      tr.appendChild(D.el('td', null, D.severityInfo(entry.bug.severity).label));
      var priority = D.priorityLevel(entry.bug.priority);
      tr.appendChild(D.el('td', null, priority ? 'P' + priority : 'Not set'));
      tr.appendChild(D.el('td', null, entry.bug.title));
      var casesCell = D.el('td');
      entry.cases.forEach(function (testCase, index) {
        if (index) casesCell.appendChild(document.createTextNode(', '));
        var link = D.el('a', 'caseid', '#' + testCase.id); link.href = D.wiUrl(testCase.id); link.target = '_blank'; link.rel = 'noopener';
        casesCell.appendChild(link);
      });
      tr.appendChild(casesCell); tb.appendChild(tr);
    });
    t.appendChild(tb); return t;
  };
  D.statsTable = function (counts) {
    var total = D.sum(counts), t = D.el('table'), thead = D.el('thead'), hr = D.el('tr');
    ['State', 'Count', 'Share', ''].forEach(function (h, i) { hr.appendChild(D.el('th', (i === 1 || i === 2) ? 'num' : null, h)); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = D.el('tbody'), keys = D.orderStates(Object.keys(counts));
    if (!keys.length) { var er = D.el('tr'), td = D.el('td', 'empty', 'No data in the selected time range'); td.colSpan = 4; er.appendChild(td); tb.appendChild(er); }
    keys.forEach(function (k) {
      var tr = D.el('tr'), td1 = D.el('td'); td1.appendChild(D.chip(k)); tr.appendChild(td1);
      tr.appendChild(D.el('td', 'num', String(counts[k])));
      tr.appendChild(D.el('td', 'num', total ? (counts[k] * 100 / total).toFixed(1) + '%' : '-'));
      var td4 = D.el('td'), bar = D.el('div', 'bar'), seg = D.el('div');
      seg.style.width = (total ? counts[k] * 100 / total : 0) + '%'; seg.style.background = D.colorFor(k);
      bar.appendChild(seg); td4.appendChild(bar); tr.appendChild(td4); tb.appendChild(tr);
    });
    var tr2 = D.el('tr', 'total');
    tr2.appendChild(D.el('td', null, 'Total'));
    tr2.appendChild(D.el('td', 'num', String(total)));
    tr2.appendChild(D.el('td', 'num', total ? '100%' : '-'));
    tr2.appendChild(D.el('td'));
    tb.appendChild(tr2); t.appendChild(tb); return t;
  };
  D.bugLink = function (bug) {
    var link = D.el('a', 'bug-link', 'BUG #' + bug.id);
    link.href = D.wiUrl(bug.id); link.target = '_blank'; link.rel = 'noopener';
    link.title = (bug.state || 'Unknown state') + ' · ' + (bug.title || ('Bug #' + bug.id));
    return link;
  };
  D.caseRow = function (n) {
    var row = D.el('div', 'caserow'); row._case = n;
    D.decorateBlock(row, n.type || 'Test Case', n.state);
    var a = D.el('a', 'caseid', '#' + n.id); a.href = D.wiUrl(n.id); a.target = '_blank'; a.rel = 'noopener'; row.appendChild(a);
    row.appendChild(D.typeBadge(n.type || 'Test Case'));
    row.appendChild(D.el('span', 'casetitle', n.title));
    row.appendChild(D.chip(n.state));
    var metrics = n.metrics || {};
    if (D.hasMetric(metrics.priority)) row.appendChild(D.metricBadge('Priority', 'P' + (D.priorityLevel(metrics.priority) || metrics.priority), '#c084fc'));
    if (D.hasMetric(metrics.sampleSize)) row.appendChild(D.metricBadge('Sample', metrics.sampleSize, '#38bdf8'));
    if (D.hasMetric(metrics.testDuration)) row.appendChild(D.metricBadge('Duration', metrics.testDuration, '#fbbf24'));
    (n.bugs || []).forEach(function (bug) { row.appendChild(D.bugLink(bug)); });
    if (n.assigned) row.appendChild(D.el('span', 'date', n.assigned));
    row.appendChild(D.el('span', 'date', D.fmt(n.changed)));
    return row;
  };
  D.tree = function (node, level) {
    if (node.type === 'Test Case') return D.caseRow(node);
    var d = D.el('details', 'node lvl' + Math.min(level, 3)), sm = D.el('summary');
    D.decorateBlock(d, node.type, node.state);
    sm.appendChild(D.el('span', 'ntitle', node.title));
    sm.appendChild(D.typeBadge(node.type));
    sm.appendChild(D.el('span', 'spacer'));
    var cases = D.collect(node, 'Test Case');
    if (cases.length) {
      var m = D.countStates(cases);
      D.orderStates(Object.keys(m)).forEach(function (k) { sm.appendChild(D.chip(k, m[k])); });
      sm.appendChild(D.el('span', 'small', cases.length + ' cases'));
    } else { sm.appendChild(D.chip(node.state)); }
    var lk = D.el('a', 'small', '↗'); lk.href = D.wiUrl(node.id); lk.target = '_blank'; lk.rel = 'noopener';
    lk.title = 'Open in Azure DevOps #' + node.id;
    lk.addEventListener('click', function (e) { e.stopPropagation(); });
    sm.appendChild(lk); d.appendChild(sm);
    var body = D.el('div', 'nodebody');
    (node.children || []).forEach(function (c) { body.appendChild(D.tree(c, level + 1)); });
    d.appendChild(body); return d;
  };
  D.applyFilter = function (panel, text) {
    text = (text || '').trim().toLowerCase();
    panel.querySelectorAll('.caserow').forEach(function (row) {
      var n = row._case;
      var bugText = (n.bugs || []).map(function (bug) { return ' bug #' + bug.id + ' ' + bug.title + ' ' + bug.state; }).join('');
      var metricText = Object.keys(n.metrics || {}).map(function (key) { return ' ' + key + ' ' + n.metrics[key]; }).join('');
      var hit = !text || (n.title + ' #' + n.id + ' ' + n.state + bugText + metricText).toLowerCase().indexOf(text) >= 0;
      row.classList.toggle('hide', !hit);
    });
    var ds = panel.querySelectorAll('details.node');
    for (var j = ds.length - 1; j >= 0; j--) {
      var vis = ds[j].querySelectorAll('.caserow:not(.hide)').length;
      ds[j].classList.toggle('hide', !!text && vis === 0);
      if (text && vis > 0) ds[j].open = true;
    }
  };
  D.featureInventory = function () {
    var rack = D.S.racks[0], groups = [], byKey = {};
    if (!rack) return groups;
    function groupFor(feature) {
      var key = feature ? String(feature.id) : 'unmapped';
      if (!byKey[key]) {
        var name = feature ? feature.title.replace(/^(\[[^\]]*\]\s*)+/, '').trim() : 'Unmapped';
        byKey[key] = { id: key, name: name || ('Feature #' + feature.id), feature: feature, cases: [] };
        groups.push(byKey[key]);
      }
      return byKey[key];
    }
    function visit(node, currentFeature) {
      var feature = currentFeature;
      if (node !== rack && node.type === 'Feature') feature = node;
      if (node.type === 'Test Case') groupFor(feature).cases.push({ testCase: node, rack: rack, feature: feature });
      (node.children || []).forEach(function (child) { visit(child, feature); });
    }
    visit(rack, null);
    return groups;
  };
  D.xmlEsc = function (value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  };
  D.excelCell = function (value, style, numeric, href) {
    var raw = value == null || value === '' ? '-' : String(value), isNumber = numeric && /^-?\d+(?:\.\d+)?$/.test(raw);
    var attrs = style ? ' ss:StyleID="' + D.xmlEsc(style) + '"' : '';
    if (href) attrs += ' ss:HRef="' + D.xmlEsc(href) + '"';
    return '<Cell' + attrs + '><Data ss:Type="' + (isNumber ? 'Number' : 'String') + '">' + D.xmlEsc(raw) + '</Data></Cell>';
  };
  D.suiteExportRows = function () {
    var rows = [];
    D.featureInventory().forEach(function (group) {
      group.cases.forEach(function (entry) {
        var testCase = entry.testCase, fields = testCase.suiteFields || {}, metrics = testCase.metrics || {};
        rows.push({
          rack: entry.rack.label, id: testCase.id, title: testCase.title, feature: group.name, state: testCase.state,
          changed: D.fmt(testCase.changed),
          priority: D.hasMetric(metrics.priority) ? ('P' + (D.priorityLevel(metrics.priority) || metrics.priority)) : '-',
          sampleSize: D.displayFieldValue(metrics.sampleSize), cycles: D.displayFieldValue(metrics.numberOfCycles), duration: D.displayFieldValue(metrics.testDuration),
          scriptType: D.displayFieldValue(fields.scriptType), crcSdk: D.displayFieldValue(fields.crcSdk), igsOwner: D.displayFieldValue(fields.igsOwner),
          bugs: (testCase.bugs || []).map(function (bug) { return 'BUG #' + bug.id + (bug.title ? ' - ' + bug.title : ''); }).join('; ') || '-',
          comments: D.displayFieldValue(fields.comments), url: D.wiUrl(testCase.id)
        });
      });
    });
    return rows;
  };
  D.suiteExcelXml = function () {
    var rows = D.suiteExportRows();
    var headers = ['Rack', 'Case ID', 'Title', 'Test Feature', 'State', 'Changed Date', 'Priority', 'Sample Size', 'Number of Cycles', 'Test Duration', 'Script type', 'CRC SDK', 'IGS Owner', 'Linked Bugs', 'Comments', 'Azure DevOps URL'];
    var widths = [70, 72, 360, 90, 90, 110, 60, 80, 90, 95, 80, 80, 110, 240, 260, 300];
    var xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
      + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
      + '<Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top"/><Font ss:FontName="Segoe UI" ss:Size="10"/></Style>'
      + '<Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#132039" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#38BDF8"/></Borders></Style>'
      + '<Style ss:ID="Text"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="Link"><Font ss:Color="#0563C1" ss:Underline="Single"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style></Styles>'
      + '<Worksheet ss:Name="Rack 1 Features"><Table ss:ExpandedColumnCount="16" ss:ExpandedRowCount="' + (rows.length + 1) + '" x:FullColumns="1" x:FullRows="1">';
    widths.forEach(function (width) { xml += '<Column ss:AutoFitWidth="0" ss:Width="' + width + '"/>'; });
    xml += '<Row ss:Height="30">'; headers.forEach(function (header) { xml += D.excelCell(header, 'Header'); }); xml += '</Row>';
    rows.forEach(function (row) {
      xml += '<Row>'
        + D.excelCell(row.rack, 'Text') + D.excelCell(row.id, 'Link', false, row.url) + D.excelCell(row.title, 'Text')
        + D.excelCell(row.feature, 'Text') + D.excelCell(row.state, 'Text') + D.excelCell(row.changed, 'Text') + D.excelCell(row.priority, 'Text')
        + D.excelCell(row.sampleSize, 'Text', true) + D.excelCell(row.cycles, 'Text', true) + D.excelCell(row.duration, 'Text')
        + D.excelCell(row.scriptType, 'Text') + D.excelCell(row.crcSdk, 'Text') + D.excelCell(row.igsOwner, 'Text')
        + D.excelCell(row.bugs, 'Text') + D.excelCell(row.comments, 'Text') + D.excelCell(row.url, 'Link', false, row.url) + '</Row>';
    });
    xml += '</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>'
      + '<AutoFilter x:Range="R1C1:R' + (rows.length + 1) + 'C16" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet></Workbook>';
    return { xml: xml, count: rows.length };
  };
  D.exportSuiteExcel = function () {
    var result = D.suiteExcelXml(), now = new Date();
    function pad(value) { return value < 10 ? '0' + value : String(value); }
    var stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
    var blob = new Blob([result.xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var link = D.el('a'); link.href = URL.createObjectURL(blob); link.download = 'C4143-Rack1-Test-Features-' + stamp + '.xls';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
    D.setStatus('Downloaded Excel workbook with ' + result.count + ' Rack 1 Test Feature case rows.', 'info');
  };
  D.featureCaseTable = function (entries, featureName) {
    var scroll = D.el('div', 'feature-table-scroll');
    var table = D.el('table', 'feature-table'), thead = D.el('thead'), header = D.el('tr');
    ['ID', 'Title', 'State', 'Changed', 'Priority', 'Sample Size', 'Cycles', 'Duration', 'Script type', 'CRC SDK', 'IGS Owner', 'Linked Bugs', 'Comments'].forEach(function (label) { header.appendChild(D.el('th', null, label)); });
    thead.appendChild(header); table.appendChild(thead);
    var tbody = D.el('tbody');
    entries.forEach(function (entry) {
      var testCase = entry.testCase, fields = testCase.suiteFields || {}, metrics = testCase.metrics || {};
      var row = D.el('tr', 'feature-case-row'); row.style.borderLeftColor = D.colorFor(testCase.state);
      row.title = 'Rack: ' + entry.rack.label + ' · Feature: ' + featureName + ' · State: ' + testCase.state;
      var idCell = D.el('td', 'feature-id'), idLink = D.el('a', 'caseid', String(testCase.id));
      idLink.href = D.wiUrl(testCase.id); idLink.target = '_blank'; idLink.rel = 'noopener'; idCell.appendChild(idLink); row.appendChild(idCell);
      row.appendChild(D.el('td', 'feature-title', testCase.title));
      var stateCell = D.el('td'); stateCell.appendChild(D.chip(testCase.state)); row.appendChild(stateCell);
      row.appendChild(D.el('td', null, D.fmt(testCase.changed)));
      var priority = D.priorityLevel(metrics.priority);
      row.appendChild(D.el('td', null, D.hasMetric(metrics.priority) ? (priority ? 'P' + priority : D.displayFieldValue(metrics.priority)) : '-'));
      row.appendChild(D.el('td', null, D.displayFieldValue(metrics.sampleSize)));
      row.appendChild(D.el('td', null, D.displayFieldValue(metrics.numberOfCycles)));
      row.appendChild(D.el('td', null, D.displayFieldValue(metrics.testDuration)));
      row.appendChild(D.el('td', null, D.displayFieldValue(fields.scriptType)));
      row.appendChild(D.el('td', null, D.displayFieldValue(fields.crcSdk)));
      row.appendChild(D.el('td', 'feature-owner', D.displayFieldValue(fields.igsOwner)));
      var bugs = D.el('td', 'feature-bugs');
      if ((testCase.bugs || []).length) (testCase.bugs || []).forEach(function (bug) { bugs.appendChild(D.bugLink(bug)); });
      else bugs.textContent = '-';
      row.appendChild(bugs);
      var comments = D.displayFieldValue(fields.comments), commentsCell = D.el('td', 'feature-comments', comments);
      commentsCell.title = comments === '-' ? '' : comments; row.appendChild(commentsCell);
      row._featureSearch = [testCase.id, testCase.title, featureName, entry.rack.label, testCase.state, metrics.priority,
        metrics.sampleSize, metrics.numberOfCycles, metrics.testDuration, D.fmt(testCase.changed),
        (testCase.bugs || []).map(function (bug) { return 'BUG #' + bug.id + ' ' + bug.title + ' ' + bug.state; }).join(' '),
        D.displayFieldValue(fields.scriptType), D.displayFieldValue(fields.crcSdk), D.displayFieldValue(fields.igsOwner), comments].join(' ').toLowerCase();
      tbody.appendChild(row);
    });
    table.appendChild(tbody); scroll.appendChild(table); return scroll;
  };
  D.suitePanel = function () {
    var wrap = D.el('div'), groups = D.featureInventory(), allEntries = [];
    groups.forEach(function (group) { allEntries = allEntries.concat(group.cases); });
    var rackCaseCount = D.S.racks[0] ? D.collect(D.S.racks[0], 'Test Case').length : 0;
    var unmapped = (groups.filter(function (group) { return group.name === 'Unmapped'; })[0] || { cases: [] }).cases.length;
    var sticky = D.el('div', 'suite-sticky'), cards = D.el('div', 'cards');
    [
      D.card('RACK 1 TEST FEATURES', groups.filter(function (group) { return group.name !== 'Unmapped'; }).length, '#38bdf8'),
      D.card('RACK 1 CASES', rackCaseCount, '#c084fc'),
      D.card('LISTED / RACK 1 CASES', allEntries.length + ' / ' + rackCaseCount, allEntries.length === rackCaseCount ? '#34d399' : '#fb7185'),
      D.card('UNMAPPED CASES', unmapped, unmapped ? '#fb7185' : '#2dd4bf')
    ].forEach(function (card) { cards.appendChild(card); });
    sticky.appendChild(cards); wrap.appendChild(sticky);
    wrap.appendChild(D.el('p', 'suite-intro', 'This list is rebuilt directly from the current Rack 1 Feature hierarchy after every query. Every Rack 1 Test Case is grouped under its nearest parent Test Feature and uses the same live State, Bug and metric data as the Rack 1 tab.'));
    var toolbar = D.el('div', 'suite-toolbar');
    var expand = D.el('button', null, 'Expand all'), collapse = D.el('button', null, 'Collapse all');
    var download = D.el('button', 'primary', 'Download Excel (.xls)'), search = D.el('input');
    download.id = 'suiteExcelBtn'; download.title = 'Download all Rack 1 Test Feature case fields for Excel';
    search.placeholder = 'Search feature / case / state / field …';
    toolbar.appendChild(expand); toolbar.appendChild(collapse); toolbar.appendChild(download); toolbar.appendChild(search); wrap.appendChild(toolbar);
    var groupsHost = D.el('div', 'feature-groups'); wrap.appendChild(groupsHost);
    groups.forEach(function (group, index) {
      var details = D.el('details', 'feature-group'); if (index === 0) details.open = true;
      var summary = D.el('summary', 'feature-summary');
      summary.appendChild(D.el('span', 'feature-group-name', group.name)); summary.appendChild(D.el('span', 'suite-pill', group.cases.length + ' cases'));
      details.appendChild(summary);
      var body = D.el('div', 'feature-group-body'); body.appendChild(D.featureCaseTable(group.cases, group.name)); details.appendChild(body);
      groupsHost.appendChild(details);
    });
    expand.addEventListener('click', function () { wrap.querySelectorAll('details.feature-group').forEach(function (details) { details.open = true; }); });
    collapse.addEventListener('click', function () { wrap.querySelectorAll('details.feature-group').forEach(function (details) { details.open = false; }); });
    download.addEventListener('click', function () { D.exportSuiteExcel(); });
    search.addEventListener('input', function () { D.applySuiteFilter(wrap, search.value); });
    return wrap;
  };
  D.applySuiteFilter = function (panel, text) {
    text = String(text || '').trim().toLowerCase();
    panel.querySelectorAll('.feature-case-row').forEach(function (row) { row.classList.toggle('hide', !!text && row._featureSearch.indexOf(text) < 0); });
    panel.querySelectorAll('.feature-group').forEach(function (group) {
      var visible = group.querySelectorAll('.feature-case-row:not(.hide)').length;
      group.classList.toggle('hide', !!text && !visible);
      if (text && visible) group.open = true;
    });
  };
  D.rackTable = function () {
    var stateSet = {};
    var rows = D.S.racks.map(function (r) {
      var m = D.countStates(D.collect(r, 'Test Case').filter(D.inRange));
      for (var k in m) stateSet[k] = 1; return { r: r, m: m };
    });
    var states = D.orderStates(Object.keys(stateSet));
    if (!states.length) return D.el('div', 'empty', 'No data in the selected time range');
    var t = D.el('table'), thead = D.el('thead'), hr = D.el('tr');
    hr.appendChild(D.el('th', null, 'Rack'));
    states.forEach(function (s) { hr.appendChild(D.el('th', 'num', s)); });
    hr.appendChild(D.el('th', 'num', 'Total')); thead.appendChild(hr); t.appendChild(thead);
    var tb = D.el('tbody'), totals = {}, grand = 0;
    rows.forEach(function (row) {
      var tr = D.el('tr'), td0 = D.el('td');
      var a = D.el('a', null, row.r.label + ' — ' + row.r.title.replace(/^(\[[^\]]*\]\s*)+/, ''));
      a.href = D.wiUrl(row.r.id); a.target = '_blank'; a.rel = 'noopener'; td0.appendChild(a); tr.appendChild(td0);
      var tot = 0;
      states.forEach(function (s) { var v = row.m[s] || 0; tot += v; totals[s] = (totals[s] || 0) + v; tr.appendChild(D.el('td', 'num', String(v))); });
      grand += tot; tr.appendChild(D.el('td', 'num', String(tot))); tb.appendChild(tr);
    });
    var tr2 = D.el('tr', 'total'); tr2.appendChild(D.el('td', null, 'Total'));
    states.forEach(function (s) { tr2.appendChild(D.el('td', 'num', String(totals[s] || 0))); });
    tr2.appendChild(D.el('td', 'num', String(grand))); tb.appendChild(tr2); t.appendChild(tb); return t;
  };
  D.updateStickyOffset = function () {
    var controls = document.querySelector('.controls');
    if (controls) document.documentElement.style.setProperty('--dvdash-controls-height', Math.ceil(controls.getBoundingClientRect().height) + 'px');
  };
  D.installStickyOffset = function () {
    if (window.__dvdashControlsObserver && window.__dvdashControlsObserver.disconnect) window.__dvdashControlsObserver.disconnect();
    if (window.__dvdashStickyResize) window.removeEventListener('resize', window.__dvdashStickyResize);
    window.__dvdashStickyResize = D.updateStickyOffset; window.addEventListener('resize', window.__dvdashStickyResize);
    if (window.ResizeObserver) {
      window.__dvdashControlsObserver = new ResizeObserver(D.updateStickyOffset);
      var controls = document.querySelector('.controls'); if (controls) window.__dvdashControlsObserver.observe(controls);
    }
    D.updateStickyOffset(); requestAnimationFrame(D.updateStickyOffset);
  };
  D.buildShell = function () {
    document.head.innerHTML = ''; document.body.innerHTML = '';
    document.title = 'C4143 DV-Scale Rack Test Status Dashboard';
    var st = D.el('style'); st.textContent = D.CSS; document.head.appendChild(st);
    var mc = D.el('meta'); mc.setAttribute('charset', 'utf-8'); document.head.appendChild(mc);

    var header = D.el('header');
    var left = D.el('div');
    left.appendChild(D.el('h1', null, 'C4143 DV-Scale — 5 Racks Test Status Dashboard'));
    var sub = D.el('div', 'sub');
    sub.appendChild(document.createTextNode('Source: '));
    var qa = D.el('a', null, 'Azure DevOps query C4143_DV-Scale');
    qa.href = D.CFG.queryUrl; qa.target = '_blank'; qa.rel = 'noopener'; sub.appendChild(qa);
    sub.appendChild(document.createTextNode(' ·  Every open / refresh of this page re-runs the query using the selected mode'));
    left.appendChild(sub); header.appendChild(left);
    var right = D.el('div'); right.style.display = 'flex'; right.style.gap = '8px'; right.style.alignItems = 'center'; right.style.flexWrap = 'wrap';
    var upd = D.el('span', 'sub', 'Updated: —'); upd.id = 'updated'; right.appendChild(upd);
    var rb = D.el('button', 'primary', 'Re-run query'); rb.id = 'reloadBtn'; right.appendChild(rb);
    var eb = D.el('button', null, 'Export offline snapshot .html'); eb.id = 'exportBtn'; right.appendChild(eb);
    header.appendChild(right); document.body.appendChild(header);

    var ctl = D.el('div', 'controls');
    var l0 = D.el('label', null, 'Data source');
    var ms = D.el('select'); ms.id = 'modeSel';
    D.MODES.forEach(function (o) { var op = D.el('option', null, o[1]); op.value = o[0]; if (o[0] === D.S.mode) op.selected = true; ms.appendChild(op); });
    l0.appendChild(ms); ctl.appendChild(l0);

    var pw = D.el('span'); pw.id = 'proxyWrap';
    pw.style.display = D.S.mode === 'proxy' ? 'inline-flex' : 'none';
    pw.style.gap = '6px'; pw.style.alignItems = 'center';
    var pi = D.el('input'); pi.id = 'proxyInput'; pi.value = D.getProxy(); pi.placeholder = 'http://localhost:8080'; pi.style.minWidth = '210px';
    var ps = D.el('button', null, 'Save proxy'); ps.id = 'proxySave';
    pw.appendChild(pi); pw.appendChild(ps); ctl.appendChild(pw);

    var l1 = D.el('label', null, 'Time range (by Changed Date)');
    var rs = D.el('select'); rs.id = 'rangeSel';
    D.RANGES.forEach(function (o) { var op = D.el('option', null, o[1]); op.value = o[0]; if (o[0] === D.S.range) op.selected = true; rs.appendChild(op); });
    l1.appendChild(rs); ctl.appendChild(l1);
    var l2 = D.el('label', null, 'Chart type');
    var ts = D.el('select'); ts.id = 'typeSel';
    [['pie', 'Pie chart'], ['bar', 'Bar chart']].forEach(function (o) { var op = D.el('option', null, o[1]); op.value = o[0]; if (o[0] === D.S.chartType) op.selected = true; ts.appendChild(op); });
    l2.appendChild(ts); ctl.appendChild(l2);
    var l3 = D.el('label', null, ' Auto refresh every 5 min');
    var cb = D.el('input'); cb.type = 'checkbox'; cb.id = 'autoRef'; cb.style.minWidth = 'auto';
    l3.insertBefore(cb, l3.firstChild); ctl.appendChild(l3);
    ctl.appendChild(D.el('span', 'spacer'));
    var lg = D.el('span', 'small'); lg.appendChild(document.createTextNode('State colours: '));
    ['Not Started', 'In Progress', 'Passed', 'Failed', 'Blocked'].forEach(function (s) { lg.appendChild(D.chip(s)); lg.appendChild(document.createTextNode(' ')); });
    ctl.appendChild(lg);
    var tl = D.el('span', 'small colour-key'); tl.appendChild(document.createTextNode('Work item colours: '));
    ['Feature', 'System Requirement', 'Test Case'].forEach(function (type) { tl.appendChild(D.typeBadge(type)); });
    ctl.appendChild(tl);
    document.body.appendChild(ctl);
    D.installStickyOffset();

    var banner = D.el('div', 'banner info', 'Preparing to load…'); banner.id = 'banner'; document.body.appendChild(banner);
    var main = D.el('main', 'dashboard-main');
    var tabs = D.el('div', 'tabs'); tabs.id = 'tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-orientation', 'vertical'); main.appendChild(tabs);
    var panels = D.el('div'); panels.id = 'panels'; main.appendChild(panels);
    document.body.appendChild(main);

    ms.addEventListener('change', function (e) {
      D.S.mode = e.target.value;
      try { localStorage.setItem('dvdashMode', D.S.mode); } catch (err) { }
      document.getElementById('proxyWrap').style.display = D.S.mode === 'proxy' ? 'inline-flex' : 'none';
      D.updateStickyOffset();
      D.load();
    });
    ps.addEventListener('click', function () {
      var v = document.getElementById('proxyInput').value.trim();
      if (v) { try { localStorage.setItem('dvdashProxy', v); } catch (err) { } D.load(); }
    });
    rs.addEventListener('change', function (e) { D.S.range = e.target.value; D.refresh(); });
    ts.addEventListener('change', function (e) { D.S.chartType = e.target.value; D.refresh(); });
    rb.addEventListener('click', function () { D.load(); });
    eb.addEventListener('click', function () { D.exportHtml(); });
    if (!D._timer) D._timer = setInterval(function () { var c = document.getElementById('autoRef'); if (c && c.checked && D.S.mode !== 'snapshot') D.load(); }, 300000);
  };
  D.buildPanels = function () {
    var tabsBar = document.getElementById('tabs'), host = document.getElementById('panels');
    tabsBar.innerHTML = ''; host.innerHTML = ''; D.S.panels = [];
    var defs = [{ kind: 'ov', label: 'Overview (' + D.S.racks.length + ' Racks)' }]
      .concat(D.S.racks.map(function (r) { return { kind: 'rack', label: r.label, rack: r }; }))
      .concat([{ kind: 'suite', label: 'Test Features' }]);
    defs.forEach(function (def, idx) {
      var tab = D.el('button', 'tab' + (idx === D.S.active ? ' active' : ''), def.label);
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', idx === D.S.active ? 'true' : 'false');
      tab.addEventListener('click', function () { D.showTab(idx); });
      tabsBar.appendChild(tab);
      var panel = D.el('div', 'panel' + (idx === D.S.active ? ' active' : ''));
      var panelId = 'dashboard-panel-' + idx; panel.id = panelId; panel.setAttribute('role', 'tabpanel'); tab.setAttribute('aria-controls', panelId);
      var refs = { kind: def.kind, rack: def.rack, panel: panel, tab: tab };
      var cards = D.el('div', 'cards');
      if (def.kind === 'ov') {
        refs.cRacks = D.card('RACKS', D.S.racks.length, '#38bdf8');
        refs.cFeat = D.card('FEATURES', 0, '#c084fc');
        refs.cReq = D.card('SYSTEM REQS', 0, '#fbbf24');
        refs.cCase = D.card('TOTAL TEST CASES', 0, '#34d399');
        refs.cFiltered = D.card('UPDATED IN RANGE', 0, '#60a5fa');
        refs.cPass = D.card('PASS CASES / RATE', '-', '#2dd4bf');
        refs.cFail = D.card('FAIL CASES (BLOCKED) / RATE', '-', '#fb7185');
        refs.cProgress = D.card('IN PROGRESS CASES', 0, '#818cf8');
        refs.cBugs = D.card('BUGS / AFFECTED CASES', '-', '#fb923c');
        refs.cPass.title = 'Closed Test Cases are counted as Pass. Rate denominator: Test Cases in the selected time range.';
        refs.cFail.title = 'Blocked Test Cases are counted as Fail. Rate denominator: Test Cases in the selected time range.';
        refs.cProgress.title = 'Test Cases whose current Azure DevOps State is In Progress.';
        refs.cBugs.title = 'Unique linked Bugs / Test Cases affected by at least one linked Bug.';
        [refs.cRacks, refs.cFeat, refs.cReq, refs.cCase, refs.cFiltered, refs.cPass, refs.cFail, refs.cProgress, refs.cBugs].forEach(function (c) { cards.appendChild(c); });
        var stickyTop = D.el('div', 'panel-sticky'); stickyTop.appendChild(cards); panel.appendChild(stickyTop);
        var grid = D.el('div', 'grid');
        var b1 = D.box('Test Case state distribution — all Racks');
        refs.chartHost = D.el('div', 'chartwrap'); b1.appendChild(refs.chartHost);
        refs.legendHost = D.el('div'); b1.appendChild(refs.legendHost);
        var b2 = D.box('Rack comparison (stacked bar)');
        refs.cmpHost = D.el('div', 'chartwrap'); b2.appendChild(refs.cmpHost);
        grid.appendChild(b1); grid.appendChild(b2); panel.appendChild(grid);
        var b3 = D.box('Rack × State summary table');
        refs.tableBox = D.el('div'); b3.appendChild(refs.tableBox); panel.appendChild(b3);
        var bPriority = D.box('Test Case completion by Priority — Closed = completed');
        refs.priorityBox = D.el('div'); bPriority.appendChild(refs.priorityBox); panel.appendChild(bPriority);
        var bMetrics = D.box('Sample Size, Number_of_cycles & Test Duration — largest / longest first');
        refs.metricBox = D.el('div'); bMetrics.appendChild(refs.metricBox); panel.appendChild(bMetrics);
        var b4 = D.box('Linked Bug tracking — from Test Case Links');
        refs.bugStatsBox = D.el('div'); b4.appendChild(refs.bugStatsBox);
        refs.bugBox = D.el('div', 'bug-detail-scroll'); b4.appendChild(refs.bugBox); panel.appendChild(b4);
      } else if (def.kind === 'rack') {
        refs.cFeat = D.card('FEATURES', 0, '#c084fc');
        refs.cReq = D.card('SYSTEM REQS', 0, '#fbbf24');
        refs.cCase = D.card('TEST CASES', 0, '#34d399');
        refs.cFiltered = D.card('UPDATED IN RANGE', 0, '#60a5fa');
        refs.cBugs = D.card('LINKED BUGS', 0, '#f87171');
        refs.cBugs.title = 'Unique Bug work items linked from Test Cases in this Rack.';
        [refs.cFeat, refs.cReq, refs.cCase, refs.cFiltered, refs.cBugs].forEach(function (c) { cards.appendChild(c); });
        var rackSticky = D.el('div', 'panel-sticky'); rackSticky.appendChild(cards); panel.appendChild(rackSticky);
        var g = D.el('div', 'grid');
        var rb1 = D.box(def.rack.label + ' State distribution');
        refs.chartHost = D.el('div', 'chartwrap'); rb1.appendChild(refs.chartHost);
        refs.legendHost = D.el('div'); rb1.appendChild(refs.legendHost);
        var rb2 = D.box('State summary table');
        refs.tableBox = D.el('div'); rb2.appendChild(refs.tableBox);
        g.appendChild(rb1); g.appendChild(rb2); panel.appendChild(g);
        var rbPriority = D.box('Test Case completion by Priority — Closed = completed');
        refs.priorityBox = D.el('div'); rbPriority.appendChild(refs.priorityBox); panel.appendChild(rbPriority);
        var rbMetrics = D.box('Sample Size, Number_of_cycles & Test Duration — largest / longest first');
        refs.metricBox = D.el('div'); rbMetrics.appendChild(refs.metricBox); panel.appendChild(rbMetrics);
        var tb = D.box('Feature → System Requirement → Test Case (click to expand)');
        var bar = D.el('div', 'tree-toolbar');
        var bExp = D.el('button', null, 'Expand all'), bCol = D.el('button', null, 'Collapse all');
        var search = D.el('input'); search.placeholder = 'Search case title / ID / state / bug …'; search.style.minWidth = '0';
        bExp.addEventListener('click', function () { panel.querySelectorAll('details.node').forEach(function (d) { d.open = true; }); });
        bCol.addEventListener('click', function () { panel.querySelectorAll('details.node').forEach(function (d) { d.open = false; }); });
        search.addEventListener('input', function () { D.applyFilter(panel, search.value); });
        bar.appendChild(bExp); bar.appendChild(bCol); bar.appendChild(search); tb.appendChild(bar);
        var treeHost = D.el('div');
        (def.rack.children || []).forEach(function (c) { treeHost.appendChild(D.tree(c, 1)); });
        tb.appendChild(treeHost); panel.appendChild(tb);
      } else {
        refs.suiteHost = D.suitePanel();
        panel.appendChild(refs.suiteHost);
      }
      host.appendChild(panel); D.S.panels.push(refs);
    });
  };
  D.showTab = function (idx) {
    D.S.active = idx;
    D.S.panels.forEach(function (p, i) { var active = i === idx; p.tab.classList.toggle('active', active); p.tab.setAttribute('aria-selected', active ? 'true' : 'false'); p.panel.classList.toggle('active', active); });
    D.refresh();
  };
  D.drawInto = function (host, counts) {
    host.innerHTML = '';
    host.appendChild(D.S.chartType === 'bar' ? D.bar(counts) : D.pie(counts));
  };
  D.latest = function (cases) { var b = null; cases.forEach(function (c) { if (c.changed && (!b || c.changed > b)) b = c.changed; }); return b; };
  D.refresh = function () {
    var allCases = [], allFeat = [], allReq = [];
    D.S.racks.forEach(function (r) {
      allCases = allCases.concat(D.collect(r, 'Test Case'));
      allFeat = allFeat.concat(D.collect(r, 'Feature'));
      allReq = allReq.concat(D.collect(r, 'System Requirement'));
    });
    D.S.panels.forEach(function (p) {
      if (p.kind === 'ov') {
        var f = allCases.filter(D.inRange);
        var bugCases = allCases.filter(function (c) { return (c.bugs || []).length > 0; });
        var linkedBugs = D.uniqueBugs(allCases);
        var outcomes = D.outcomeSummary(f);
        p.cFeat._val.textContent = allFeat.length;
        p.cReq._val.textContent = allReq.length;
        p.cCase._val.textContent = allCases.length;
        p.cFiltered._val.textContent = f.length;
        p.cPass._val.textContent = outcomes.pass + ' · ' + outcomes.passRate;
        p.cFail._val.textContent = outcomes.fail + ' · ' + outcomes.failRate;
        p.cProgress._val.textContent = outcomes.inProgress;
        p.cBugs._val.textContent = linkedBugs.length + ' / ' + bugCases.length;
        p.tableBox.innerHTML = ''; p.tableBox.appendChild(D.rackTable());
        p.priorityBox.innerHTML = ''; p.priorityBox.appendChild(D.priorityCompletionChart(f));
        p.metricBox.innerHTML = ''; p.metricBox.appendChild(D.metricInventoryPanel(f));
        p.bugStatsBox.innerHTML = ''; p.bugStatsBox.appendChild(D.bugStats(allCases));
        p.bugBox.innerHTML = ''; p.bugBox.appendChild(D.bugTable(allCases));
        var counts = D.countStates(f);
        D.drawInto(p.chartHost, counts);
        p.legendHost.innerHTML = ''; p.legendHost.appendChild(D.legend(counts));
        var stateSet = {};
        var perRack = D.S.racks.map(function (r) { var m = D.countStates(D.collect(r, 'Test Case').filter(D.inRange)); for (var k in m) stateSet[k] = 1; return m; });
        p.cmpHost.innerHTML = '';
        p.cmpHost.appendChild(D.stacked(D.S.racks.map(function (r) { return r.label; }), perRack, D.orderStates(Object.keys(stateSet))));
      } else if (p.kind === 'rack') {
        var cs = D.collect(p.rack, 'Test Case'), fc = cs.filter(D.inRange);
        p.cFeat._val.textContent = D.collect(p.rack, 'Feature').length;
        p.cReq._val.textContent = D.collect(p.rack, 'System Requirement').length;
        p.cCase._val.textContent = cs.length;
        p.cFiltered._val.textContent = fc.length;
        p.cBugs._val.textContent = D.uniqueBugs(cs).length;
        var c2 = D.countStates(fc);
        p.tableBox.innerHTML = ''; p.tableBox.appendChild(D.statsTable(c2));
        p.priorityBox.innerHTML = ''; p.priorityBox.appendChild(D.priorityCompletionChart(fc));
        p.metricBox.innerHTML = ''; p.metricBox.appendChild(D.metricInventoryPanel(fc));
        D.drawInto(p.chartHost, c2);
        p.legendHost.innerHTML = ''; p.legendHost.appendChild(D.legend(c2));
      }
    });
    var tf = allCases.filter(D.inRange).length, totalLinkedBugs = D.uniqueBugs(allCases).length;
    var bugNote = D.S.bugLinkWarning ? ' Bug link lookup was skipped, but the core dashboard data is current.' : '';
    var metricNote = D.S.metricFieldWarning ? ' Some custom Test Case metric fields were unavailable; the rest of the dashboard is current.' : '';
    var rl = (D.RANGES.filter(function (x) { return x[0] === D.S.range; })[0] || ['', ''])[1];
    var ml = (D.MODES.filter(function (x) { return x[0] === D.S.mode; })[0] || ['', ''])[1];
    var src = D.S.snapshotMode ? ('Offline snapshot (' + D.fmt(D.S.loadedAt) + ')') : (ml + ' · ' + D.fmt(D.S.loadedAt) + ' query re-run');
    if (!tf && allCases.length) {
      D.setStatus(src + ': loaded ' + allCases.length + ' test cases, but nothing was updated within "' + rl + '" — charts are empty. Latest change: ' + D.fmt(D.latest(allCases)) + '.' + bugNote + metricNote, 'warn');
    } else if (D.S.racks.length) {
      D.setStatus(src + ': ' + D.S.racks.length + ' racks, ' + allCases.length + ' test cases, ' + totalLinkedBugs + ' linked Bugs; "' + rl + '" contains ' + tf + ' updated items.' + bugNote + metricNote, (D.S.bugLinkWarning || D.S.metricFieldWarning) ? 'warn' : 'info');
    }
  };
  D.load = async function () {
    var modeLabel = (D.MODES.filter(function (m) { return m[0] === D.S.mode; })[0] || ['', ''])[1];
    if (D.S.mode === 'snapshot') {
      var s = D.readSnapshot();
      if (!s || !s.racks || !s.racks.length) {
        D.setStatus('No offline snapshot available. Switch to "Live query" or "Local proxy" and load successfully once (a snapshot is then saved automatically), or open an exported snapshot HTML file.', 'err');
        return;
      }
      D.S.racks = s.racks; D.S.loadedAt = s.savedAt || null; D.S.snapshotMode = true; D.S.bugLinkWarning = ''; D.S.metricFieldWarning = '';
      document.getElementById('updated').textContent = 'Snapshot: ' + D.fmt(D.S.loadedAt);
      if (D.S.active > D.S.racks.length + 1) D.S.active = 0;
      D.buildPanels(); D.refresh();
      return;
    }
    D.setStatus('Running the query with "' + modeLabel + '" and fetching work items …', 'info');
    try {
      var res = await D.runQuery();
      D.S.racks = res.racks; D.S.loadedAt = new Date().toISOString(); D.S.snapshotMode = false;
      document.getElementById('updated').textContent = 'Updated: ' + D.fmt(D.S.loadedAt);
      D.saveSnapshot();
      if (D.S.active > D.S.racks.length + 1) D.S.active = 0;
      D.buildPanels(); D.refresh();
    } catch (e) {
      var m = String((e && e.message) || e);
      var hint = '';
      if (D.S.mode === 'live' && location.origin !== D.CFG.org) hint = '"Live query" requires this page itself to be on the ' + D.CFG.org + ' domain. If you opened a local .html file, choose "Offline snapshot" or "Local proxy" instead.';
      else if (D.S.mode === 'live') hint = 'Azure DevOps rejected or could not complete the REST request. The HTTP detail above identifies the failing API call; the page is already on the correct same-origin domain.';
      else hint = 'Cannot reach the proxy ' + D.getProxy() + '. Make sure the proxy is running, the URL is correct, and that it returns CORS headers.';
      if (m === 'AUTH') hint = 'Authentication failed: sign in to Azure DevOps in this browser (or configure a PAT on the proxy side) and try again.';
      var snap = D.readSnapshot();
      D.setStatus('Load failed (' + m + '). ' + hint + (snap ? '  A snapshot from ' + D.fmt(snap.savedAt) + '  is available — switch to "Offline snapshot" to view it.' : ''), 'err');
    }
  };
  D.MODES = [["live","Live query (same-origin REST API)"],["snapshot","Offline snapshot (no network)"],["proxy","Local proxy (custom URL)"]];
  D.getProxy = function () { return (localStorage.getItem('dvdashProxy') || 'http://localhost:8080').replace(/\/+$/, ''); };
  D.baseFor = function () { return D.S.mode === 'proxy' ? D.getProxy() : D.CFG.org; };
  D.saveSnapshot = function () {
    try { localStorage.setItem('dvdashSnapshot', JSON.stringify({ savedAt: D.S.loadedAt, racks: D.S.racks })); return true; }
    catch (e) { return false; }
  };
  D.readSnapshot = function () {
    if (D.EMBEDDED && D.EMBEDDED.racks) return D.EMBEDDED;
    try { var s = localStorage.getItem('dvdashSnapshot'); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  D.serialize = function () {
    var parts = [];
    Object.keys(D).forEach(function (k) {
      if (k === 'EMBEDDED') return;
      var v = D[k];
      if (typeof v === 'function') parts.push('D.' + k + ' = ' + v.toString() + ';');
      else if (k === 'S') parts.push('D.S = {racks:[],loadedAt:null,range:"all",chartType:"pie",panels:[],active:0,mode:"live"};');
      else if (k === '_timer' || k === '_statusFadeTimer' || k === '_statusHideTimer') return;
      else parts.push('D.' + k + ' = ' + JSON.stringify(v) + ';');
    });
    return parts.join('\n').replace(/<\/script/gi, '<\\/script');
  };
  D.exportHtml = function () {
    if (!D.S.racks || !D.S.racks.length) { D.setStatus('Nothing to export yet — load data successfully first.', 'warn'); return; }
    var snap = JSON.stringify({ savedAt: D.S.loadedAt || new Date().toISOString(), racks: D.S.racks }).replace(/</g, '\\u003c');
    var html = '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">'
      + '<title>C4143 DV-Scale Rack Test Status Dashboard (Offline snapshot)</title></head><body>'
      + '<script id="dvdash-snapshot" type="application/json">' + snap + '<\/script>'
      + '<script>\nvar D = {};\n' + D.serialize()
      + '\nD.EMBEDDED = JSON.parse(document.getElementById("dvdash-snapshot").textContent);'
      + '\nD.S.mode = "snapshot";'
      + '\nD.buildShell(); D.load();\n<\/script></body></html>';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'C4143-DVScale-Dashboard-snapshot.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    D.setStatus('Exported offline snapshot HTML containing ' + D.collect({ children: D.S.racks, type: 'x' }, 'Test Case').length + ' test cases. It can be opened offline on any computer.', 'info');
  };
  D.persistWire = function () {
    var rs = document.getElementById('rangeSel'), ts = document.getElementById('typeSel');
    if (rs) rs.addEventListener('change', function (e) { try { localStorage.setItem('dvdashRange', e.target.value); } catch (x) { } });
    if (ts) ts.addEventListener('change', function (e) { try { localStorage.setItem('dvdashType', e.target.value); } catch (x) { } });
  };
  D.boot = function () {
    try {
      D.S.mode = localStorage.getItem('dvdashMode') || D.S.mode || 'live';
      D.S.range = localStorage.getItem('dvdashRange') || D.S.range || 'all';
      D.S.chartType = localStorage.getItem('dvdashType') || D.S.chartType || 'pie';
    } catch (e) { }
    D.buildShell(); D.persistWire(); D.load();
  };
  D.boot();
})();
