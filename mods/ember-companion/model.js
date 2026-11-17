export const PREFS_KEY = "ember.preferences.v1";
export const JOURNAL_KEY = "ember.activity.v1";
export const HISTORY_LIMIT = 60;
export const STATUSES = ["blocked", "done", "working", "idle"];
export const DEFAULT_PREFS = { language: "pt", motion: true, quiet: false, size: 180, sessions: 0, scope: "all", workUpdates: true, completionAlerts: true, character: "illustrated", setupComplete: false, compact: false, snoozeUntil: 0 };
const clean = (value, limit = 160) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";

export function restorePreferences(saved) {
  const prefs = { ...DEFAULT_PREFS };
  if (!saved || typeof saved !== "object") return prefs;
  for (const key of ["motion", "quiet", "workUpdates", "completionAlerts", "setupComplete", "compact"]) if (typeof saved[key] === "boolean") prefs[key] = saved[key];
  for (const [key, values] of Object.entries({language:["pt","en"], size:[140,180,220], scope:["all","current"], character:["illustrated","animated"]})) if (values.includes(saved[key])) prefs[key] = saved[key];
  if (Number.isSafeInteger(saved.sessions) && saved.sessions >= 0) prefs.sessions = saved.sessions;
  if (Number.isFinite(saved.snoozeUntil) && saved.snoozeUntil >= 0 && saved.snoozeUntil <= 8640000000000000) prefs.snoozeUntil = saved.snoozeUntil;
  return prefs;
}

export function agentSnapshot(agent) {
  const program = clean(agent.program?.name || agent.app, 48) || "Agent";
  const meaningful = value => {
    const text = clean(value).replace(/^[^\p{L}\p{N}~/]+/u, "");
    const generic = [program, agent.program?.key, agent.app].filter(Boolean).map(v => String(v).toLowerCase());
    return text && !generic.includes(text.toLowerCase()) && !/^\d+$/.test(text) && !/^(?:[~/]|[A-Za-z]:\\)/.test(text) && !/^\S+@\S+/.test(text) ? text : "";
  };
  const address = clean(agent.address, 256);
  return { address, space: clean(agent.space, 256), spaceName: clean(agent.space_name, 64), program,
    task: meaningful(agent.title) || meaningful(agent.tab_name) || `${program} · ${address}`,
    status: STATUSES.includes(agent.status) ? agent.status : "idle" };
}

export function inScope(item, prefs, space) { return prefs.scope === "all" || Boolean(space && item.space === space); }
export function scopedAgents(raw, prefs, space) { return raw.map(agentSnapshot).filter(a => inScope(a, prefs, space)).sort((a,b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)); }
export function statusText(status, language) {
  return ({blocked:["Precisa de você","Needs you"],done:["Concluído","Done"],working:["Trabalhando","Working"],idle:["Disponível","Idle"]}[status] || ["Disponível","Idle"])[language === "pt" ? 0 : 1];
}
export function activityText(event, language) {
  const pt = language === "pt";
  const place = event.spaceName ? (pt ? ` em ${event.spaceName}` : ` in ${event.spaceName}`) : "";
  const task = pt ? `Tarefa informada: ${event.task}.` : `Reported task: ${event.task}.`;
  if (event.status === "blocked") return pt ? `${event.program} precisa da sua atenção${place}. ${task}` : `${event.program} needs your attention${place}. ${task}`;
  if (event.status === "done") return pt ? `${event.program} terminou${place}. ${task}` : `${event.program} finished${place}. ${task}`;
  if (event.status === "working") return pt ? `${event.program} está trabalhando${place}. ${task}` : `${event.program} is working${place}. ${task}`;
  return pt ? `${event.program} está disponível${place}. ${task}` : `${event.program} is idle${place}. ${task}`;
}
export function noticeAllowed(event, prefs, space, suppressed, now = Date.now()) {
  return !suppressed && !(prefs.snoozeUntil > now) && inScope(event,prefs,space) && (event.status === "blocked" || (event.status === "done" && prefs.completionAlerts) || (event.status === "working" && prefs.workUpdates && !prefs.quiet));
}

function restoreSnapshot(value) {
  if (!value || typeof value !== "object" || typeof value.address !== "string" || !value.address || !STATUSES.includes(value.status)) return null;
  if (!["space","spaceName","program","task"].every(key => typeof value[key] === "string")) return null;
  const address = clean(value.address,256);
  if (!address) return null;
  return { address, space:clean(value.space,256), spaceName:clean(value.spaceName,64), program:clean(value.program,48), task:clean(value.task), status:value.status };
}

export class ActivityModel {
  history = [];
  previous = new Map();
  pending = new Map();
  nextId = 1;
  lastWorkAt = -Infinity;
  constructor(saved) {
    if (saved?.version !== 1) return;
    if (Array.isArray(saved.events)) for (const value of saved.events.slice(-HISTORY_LIMIT)) {
      const snapshot = restoreSnapshot(value);
      if (!snapshot || !Number.isFinite(value.at) || value.at < 0 || value.at > 8640000000000000 || !["observed","status","task"].includes(value.kind)) continue;
      this.history.push({...snapshot, at:value.at, kind:value.kind, id:this.nextId++});
    }
    if (Array.isArray(saved.observed)) for (const value of saved.observed.slice(-1000)) {
      const snapshot = restoreSnapshot(value);
      if (snapshot) this.previous.set(snapshot.address,snapshot);
    }
  }
  serialize() { return {version:1, events:this.history, observed:[...this.previous.values()]}; }
  clear() { this.history = []; }
  observe(raw, prefs, space, now, asleep = false) {
    const current = new Map(raw.map(agentSnapshot).map(a => [a.address,a]));
    let changed = current.size !== this.previous.size;
    for (const [address, agent] of current) {
      const old = this.previous.get(address);
      const different = !old || ["status","task","space","spaceName","program"].some(key => old[key] !== agent[key]);
      if (!different) continue;
      changed = true;
      const pending = this.pending.get(address);
      this.pending.delete(address);
      const kind = !old ? "observed" : old.status !== agent.status ? "status" : agent.status === "working" && old.task !== agent.task ? "task" : null;
      if (!kind) {
        if (pending && pending.status === agent.status) this.pending.set(address,{...pending,...agent});
        continue;
      }
      const event = {...agent, at:now, kind, id:this.nextId++};
      this.history.push(event);
      if (noticeAllowed(event,prefs,space,asleep,now)) this.pending.set(address,event);
    }
    this.history = this.history.slice(-HISTORY_LIMIT);
    this.previous = current;
    this.prune(prefs,space,asleep,now);
    return changed;
  }
  prune(prefs,space,asleep = false,now = Date.now()) {
    for (const [address,event] of this.pending) {
      const live = this.previous.get(address);
      if (!live || live.status !== event.status || live.task !== event.task || !noticeAllowed(event,prefs,space,asleep,now)) this.pending.delete(address);
    }
  }
  takeNotice(prefs,space,now,asleep = false) {
    this.prune(prefs,space,asleep,now);
    const event = [...this.pending.values()].sort((a,b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.at-b.at).find(a => a.status !== "working" || now-this.lastWorkAt >= 60000);
    if (!event) return null;
    this.pending.delete(event.address);
    if (event.status === "working") this.lastWorkAt = now;
    return event;
  }
}
