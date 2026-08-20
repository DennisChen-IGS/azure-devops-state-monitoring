import * as SDK from "azure-devops-extension-sdk";
import type { WidgetSettings, WidgetStatus } from "azure-devops-extension-api/Dashboard/WidgetContracts";

const WIDGET_STATUS_SUCCESS = 0;

const QUERY_ID = "9254024e-6a97-44ed-953b-1aa07d38fb48";
const colors: Record<string, string> = {
  "Not Started": "#94a3b8", "In Progress": "#818cf8", Blocked: "#fb7185", Closed: "#2dd4bf", Passed: "#34d399", Failed: "#f87171"
};

interface Summary {
  total: number;
  states: Record<string, number>;
  updatedAt: Date;
  hubUrl: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}

async function apiFetch(url: string, token: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadSummary(): Promise<Summary> {
  const context = SDK.getWebContext();
  const host = SDK.getHost();
  const project = context.project?.name;
  if (!project) throw new Error("Project context is unavailable");
  const token = await SDK.getAccessToken();
  const base = `https://dev.azure.com/${encodeURIComponent(host.name)}/${encodeURIComponent(project)}`;
  const wiql = await apiFetch(`${base}/_apis/wit/wiql/${QUERY_ID}?api-version=7.1&$top=5000`, token);
  const ids = new Set<number>();
  (wiql.workItemRelations || []).forEach((relation: any) => { if (relation.source?.id) ids.add(relation.source.id); if (relation.target?.id) ids.add(relation.target.id); });
  (wiql.workItems || []).forEach((item: any) => { if (item.id) ids.add(item.id); });
  const values: any[] = [];
  const idList = [...ids];
  for (let index = 0; index < idList.length; index += 200) {
    const batch = await apiFetch(`${base}/_apis/wit/workitemsbatch?api-version=7.1`, token, { method: "POST", body: JSON.stringify({ ids: idList.slice(index, index + 200), fields: ["System.WorkItemType", "System.State"] }) });
    values.push(...(batch.value || []));
  }
  const states: Record<string, number> = {};
  values.filter((item) => item.fields?.["System.WorkItemType"] === "Test Case").forEach((item) => {
    const state = item.fields["System.State"] || "Unknown";
    states[state] = (states[state] || 0) + 1;
  });
  const extension = SDK.getExtensionContext();
  const contribution = `${extension.publisherId}.${extension.extensionId}.c4143-dashboard-hub`;
  return { total: Object.values(states).reduce((sum, count) => sum + count, 0), states, updatedAt: new Date(), hubUrl: `${base}/_apps/hub/${contribution}` };
}

function render(summary: Summary, title: string): void {
  const root = document.getElementById("widget-root")!;
  const max = Math.max(1, ...Object.values(summary.states));
  const rows = Object.entries(summary.states).sort((a, b) => b[1] - a[1]).map(([state, count]) => `<div class="state-row"><span>${escapeHtml(state)}</span><div class="state-track"><div class="state-fill" style="width:${count * 100 / max}%;background:${colors[state] || "#38bdf8"}"></div></div><span class="state-value">${count}</span></div>`).join("");
  root.innerHTML = `<h2>${escapeHtml(title)}</h2><div class="total"><strong>${summary.total}</strong><span>live test cases</span></div><div class="state-list">${rows}</div><div class="footer"><span class="updated">Updated ${summary.updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><a class="open-link" target="_top" href="${escapeHtml(summary.hubUrl)}">Open full dashboard</a></div>`;
}

async function update(widgetSettings: WidgetSettings): Promise<WidgetStatus> {
  try {
    render(await loadSummary(), widgetSettings.name || "C4143 DV-Scale Status");
    return { statusType: WIDGET_STATUS_SUCCESS };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    document.getElementById("widget-root")!.innerHTML = `<h2>${escapeHtml(widgetSettings.name || "C4143 DV-Scale Status")}</h2><div class="error">Unable to load the live Query: ${escapeHtml(message)}</div>`;
    return Promise.reject({ message, isUserVisible: true, isRichText: false });
  }
}

SDK.init().then(() => {
  SDK.register("c4143-summary-widget", {
    preload: async () => ({ statusType: WIDGET_STATUS_SUCCESS }),
    load: update,
    reload: update
  });
});
