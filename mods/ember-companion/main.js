import { View, div, image } from "gpui-kit";
import { agents, theme, notify, shared, setShared, run, focused, props, setAgentOrder, layout } from "herdr";
import { PREFS_KEY, JOURNAL_KEY, STATUSES, restorePreferences, scopedAgents, inScope, statusText, activityText, noticeAllowed, ActivityModel } from "./model.js";
import { VOICE_KEY, restoreVoice, nextVoice } from "./voice.js";
import { animationFrame, ANIMATION_TICK_MS } from "./animation.js";

const MOODS = { blocked:"worried", done:"happy", working:"thinking", idle:"chibi" };

export default class EmberCompanion extends View {
  prefs = restorePreferences(null);
  model = new ActivityModel();
  panel = "closed";
  asleep = false;
  voice = restoreVoice(null);
  setupPreview = false;
  coffee = 0;
  bubble = null;
  lastPoll = 0;
  deadline = null;
  remaining = 1500;
  agentList = false;

  text(pt,en) { return this.prefs.language === "pt" ? pt : en; }
  line(category) {
    const line = nextVoice(this.voice,category,this.prefs.language);
    setShared(VOICE_KEY,this.voice);
    return line;
  }
  suppressed() { return this.asleep || this.panel === "setup" || this.prefs.compact; }
  currentSpace() { return focused()?.space || null; }
  list() { return scopedAgents(agents(),this.prefs,this.currentSpace()); }
  persist() { setShared(JOURNAL_KEY,this.model.serialize()); }
  save(patch) {
    this.prefs = restorePreferences({...this.prefs,...patch});
    setShared(PREFS_KEY,this.prefs);
    this.model.prune(this.prefs,this.currentSpace(),this.suppressed(),Date.now());
    this.reconcileBubble(this.list());
  }
  say(text,mood = "happy",target = null,now = Date.now(),event = null) {
    this.bubble = {text,mood,target,event,start:now,until:now+text.length*30+Math.max(6000,text.length*65),revealed:!this.prefs.motion};
  }
  advanceBubble(now = Date.now()) {
    if (!this.bubble) return;
    if (!this.bubble.revealed) {
      this.bubble.revealed = true;
      this.bubble.until = now+Math.max(6000,this.bubble.text.length*65);
    } else this.bubble = null;
  }
  reconcileBubble(list,now = Date.now()) {
    const event = this.bubble?.event;
    if (!event) return;
    const live = list.find(a => a.address === event.address);
    if (!live || live.status !== event.status || live.task !== event.task || !noticeAllowed(event,this.prefs,this.currentSpace(),this.suppressed(),now)) this.bubble = null;
  }
  observe(raw,now) {
    const space = this.currentSpace();
    if (this.model.observe(raw,this.prefs,space,now,this.suppressed())) this.persist();
    this.reconcileBubble(scopedAgents(raw,this.prefs,space),now);
    const activeStatus = this.bubble?.event?.status;
    if (activeStatus && [...this.model.pending.values()].some(a => STATUSES.indexOf(a.status) < STATUSES.indexOf(activeStatus))) this.bubble = null;
    if (this.bubble || this.suppressed()) return;
    const event = this.model.takeNotice(this.prefs,space,now,this.suppressed());
    if (event) this.say(activityText(event,this.prefs.language) + (event.status === "done" ? ` ${this.line("celebration")}` : ""),MOODS[event.status],event.address,now,event);
  }
  tick(now,raw) {
    if (this.prefs.snoozeUntil && now >= this.prefs.snoozeUntil) this.resumeAlerts(raw,now);
    if (this.bubble && now >= this.bubble.until) this.bubble = null;
    if (this.deadline !== null) {
      this.remaining = Math.max(0,Math.ceil((this.deadline-now)/1000));
      if (this.remaining === 0) {
        this.deadline = null;
        this.save({sessions:this.prefs.sessions+1});
        this.say(this.text("Missão cumprida! Levante e faça uma pausa.","Quest complete! Stand up and take a break."),"happy",null,now);
        notify({title:"Ember",body:this.text("Sessão de foco concluída!","Focus session complete!"),level:"success"});
      }
    }
    this.observe(raw,now);
  }
  init(_props,cx) {
    this.agentList = props()?.view === "agents";
    this.prefs = restorePreferences(shared(PREFS_KEY));
    if (this.agentList) return;
    this.voice = restoreVoice(shared(VOICE_KEY));
    if (!this.prefs.setupComplete) this.panel = "setup";
    this.model = new ActivityModel(shared(JOURNAL_KEY));
    this.observe(agents(),Date.now());
    if (!this.suppressed() && !(this.prefs.snoozeUntil > Date.now()) && !this.prefs.quiet && !this.bubble) this.say(this.line("greeting"));
    cx.spawn(async cx => {
      for (;;) {
        await cx.sleep(ANIMATION_TICK_MS);
        const now = Date.now();
        if (now-this.lastPoll >= 1000) {
          this.lastPoll = now;
          this.tick(now,agents());
          cx.notify();
        } else if ((this.prefs.character === "animated" && this.prefs.motion) || (this.bubble && !this.bubble.revealed && now-this.bubble.start < this.bubble.text.length*30)) cx.notify();
      }
    });
  }
  focusAgent(address) {
    if (this.agentList) this.prefs = restorePreferences(shared(PREFS_KEY));
    if (this.list().some(a => a.address === address)) run("agent.focus",{terminal:address});
  }
  togglePanel(panel) { this.panel = this.panel === panel ? "closed" : panel; }
  button(id,label,action) {
    const t = theme();
    return div().id(id).px(8).py(7).rounded(8).bg(t.raised).text_color(t.foreground).text_size(12).whitespace_normal().cursor_pointer().child(label).on_click((_e,cx) => { action(); cx.notify(); });
  }
  agentRow(agent,prefix) {
    const t = theme();
    return div().id(`${prefix}-${agent.address}`).w_full().min_w(0).flex_none().flex().flex_col().gap(3).p(8).rounded(6).bg(t.surface).cursor_pointer()
      .tooltip(`${agent.program} · ${agent.task} · ${agent.spaceName}`)
      .child(div().text_size(12).text_color(t.foreground).whitespace_normal().child(agent.task))
      .child(div().text_size(10).text_color(t.muted).whitespace_normal().child(`${agent.program}${agent.spaceName ? ` · ${agent.spaceName}` : ""}`))
      .on_click((_e,cx) => { this.focusAgent(agent.address); cx.notify(); });
  }
  groupedRows(list,prefix) {
    const t = theme();
    return STATUSES.map(status => {
      const group = list.filter(a => a.status === status);
      return div().flex().flex_col().gap(4).flex_none()
        .child(div().text_size(11).text_color(t[status] || t.muted).child(`${statusText(status,this.prefs.language)} · ${group.length}`))
        .children(group.map(a => this.agentRow(a,prefix)));
    });
  }
  scopeLabel() { return this.prefs.scope === "all" ? this.text("Todos os espaços","All spaces") : this.text("Espaço atual","Current space"); }
  renderSummary(list) {
    return div().id("ember-summary").max_h(230).overflow_y_scroll().flex().flex_col().gap(8)
      .child(div().text_size(11).text_color(theme().muted).child(this.scopeLabel()))
      .when(list.length === 0,el => el.child(div().text_size(12).whitespace_normal().child(this.text("Nenhum agente neste escopo.","No agents in this scope."))))
      .children(this.groupedRows(list,"summary"));
  }
  renderHistory(list) {
    const events = this.model.history.filter(e => inScope(e,this.prefs,this.currentSpace())).slice().reverse();
    const t = theme();
    return div().id("ember-history").max_h(230).overflow_y_scroll().flex().flex_col().gap(6)
      .child(div().text_size(11).text_color(t.muted).child(this.scopeLabel()))
      .child(this.button("clear-history",this.text("Limpar histórico","Clear history"),() => { this.model.clear(); this.persist(); }))
      .when(events.length === 0,el => el.child(div().text_size(12).child(this.text("Nenhuma atividade registrada.","No recorded activity."))))
      .children(events.map(event => {
        const live = list.some(a => a.address === event.address);
        const date = new Date(event.at);
        const day = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,"0")}-${date.getDate().toString().padStart(2,"0")}`;
        const time = `${day} ${date.getHours().toString().padStart(2,"0")}:${date.getMinutes().toString().padStart(2,"0")}`;
        return div().id(`history-${event.id}`).flex_none().p(8).rounded(6).bg(t.surface).flex().flex_col().gap(4)
          .child(div().text_size(10).text_color(t.muted).child(`${time} · ${statusText(event.status,this.prefs.language)}${event.kind === "observed" ? this.text(" · observado"," · observed") : ""}`))
          .child(div().text_size(12).whitespace_normal().child(activityText(event,this.prefs.language)))
          .when(live,el => el.child(this.button(`history-focus-${event.id}`,this.text("Ver agente","View agent"),() => this.focusAgent(event.address))))
          .when(!live,el => el.child(div().text_size(10).text_color(t.muted).child(this.text("Agente indisponível","Agent unavailable"))));
      }));
  }
  openSetup() {
    this.panel = "setup";
    this.setupPreview = false;
    this.bubble = null;
    this.model.prune(this.prefs,this.currentSpace(),true,Date.now());
  }
  captureSilently(raw = agents(),now = Date.now()) {
    if (this.model.observe(raw,this.prefs,this.currentSpace(),now,true)) this.persist();
  }
  finishSetup() {
    this.captureSilently();
    this.setupPreview = false;
    this.bubble = null;
    this.panel = "closed";
    this.save({setupComplete:true});
  }
  resumeAlerts(raw = agents(),now = Date.now()) {
    this.captureSilently(raw,now);
    this.save({snoozeUntil:0});
  }
  snooze() {
    this.bubble = null;
    this.save({snoozeUntil:Date.now()+30*60*1000});
  }
  collapse() {
    this.panel = "closed";
    this.bubble = null;
    this.save({compact:true});
  }
  expand() {
    this.captureSilently();
    this.save({compact:false});
    this.panel = this.list().some(a => a.status === "blocked" || a.status === "done") ? "summary" : "closed";
  }
  renderSetup() {
    const selected = (value,label) => `${value ? "✓ " : ""}${label}`;
    const path = this.prefs.character === "animated" ? animationFrame("idle",Date.now(),this.prefs.motion) : "mods/ember-companion/ember-chibi.png";
    return div().id("ember-setup").w(280).max_h(520).overflow_y_scroll().p(12).flex().flex_col().gap(8).text_color(theme().foreground)
      .child(div().text_size(16).child(this.text("Conheça a Ember","Meet Ember")))
      .child(div().text_size(12).whitespace_normal().child(this.text("Escolha meu visual e idioma. Eu acompanho os agentes sem ler suas conversas.","Choose my look and language. I follow agent updates without reading their conversations.")))
      .child(div().flex().justify_center().child(image(path).w(74).h(80)))
      .child(div().flex().gap(6)
        .child(this.button("setup-en",selected(this.prefs.language === "en","English"),() => this.save({language:"en"})))
        .child(this.button("setup-pt",selected(this.prefs.language === "pt","Português"),() => this.save({language:"pt"}))))
      .child(this.button("setup-illustrated",selected(this.prefs.character === "illustrated",this.text("Ember ilustrada","Illustrated Ember")),() => this.save({character:"illustrated"})))
      .child(this.button("setup-animated",selected(this.prefs.character === "animated",this.text("Ember animada","Animated Ember")),() => this.save({character:"animated"})))
      .child(this.button("setup-preview",this.text("Testar um aviso de exemplo","Preview a sample alert"),() => { this.setupPreview = true; }))
      .when(this.setupPreview,el => el.child(div().id("setup-sample").p(10).rounded(8).bg(theme().surface).text_size(12).whitespace_normal()
        .child(this.text("EXEMPLO · ","SAMPLE · ")+activityText({program:"Codex",task:this.text("Revisar a página inicial","Review the homepage"),spaceName:"Website",status:"blocked"},this.prefs.language))))
      .child(this.button("setup-finish",this.text("Pronto, vamos começar","Done, let's start"),() => this.finishSetup()))
      .child(this.button("setup-skip",this.text("Agora não","Not now"),() => this.finishSetup()));
  }
  renderSettings() {
    const toggle = (key,pt,en) => this.button(key,`${this.text(pt,en)} · ${this.prefs[key] ? "on" : "off"}`,() => { this.save({[key]:!this.prefs[key]}); if (key === "motion" && this.bubble) this.bubble.revealed = true; });
    const time = `${Math.floor(this.remaining/60).toString().padStart(2,"0")}:${(this.remaining%60).toString().padStart(2,"0")}`;
    return div().id("ember-controls").max_h(230).overflow_y_scroll().flex().flex_col().gap(6)
      .child(this.button("setup-open",this.text("Reabrir apresentação","Open introduction"),() => this.openSetup()))
      .child(this.button("scope",this.scopeLabel(),() => this.save({scope:this.prefs.scope === "all" ? "current" : "all"})))
      .child(toggle("workUpdates","Comentários de trabalho","Work updates"))
      .child(toggle("completionAlerts","Avisos de conclusão","Completion alerts"))
      .child(toggle("quiet","Silencioso","Quiet"))
      .child(toggle("motion","Movimento","Motion"))
      .child(this.button("character",this.prefs.character === "animated" ? this.text("Personagem · vetor animado","Character · animated vector") : this.text("Personagem · ilustração","Character · illustration"),() => this.save({character:this.prefs.character === "animated" ? "illustrated" : "animated"})))
      .child(this.button("language",this.text("Idioma · português","Language · English"),() => { this.save({language:this.prefs.language === "pt" ? "en" : "pt"}); this.bubble = null; }))
      .child(this.button("size",`${this.text("Tamanho","Size")} · ${this.prefs.size}`,() => { const sizes=[140,180,220]; this.save({size:sizes[(sizes.indexOf(this.prefs.size)+1)%3]}); }))
      .child(this.button("encourage",this.text("Me anima!","Pep talk!"),() => this.say(this.line("encouragement"))))
      .child(this.button("coffee",this.text(`Oferecer café (${this.coffee})`,`Offer coffee (${this.coffee})`),() => { this.coffee++; this.say(this.line("coffee")); }))
      .child(div().text_size(12).child(`${time} · ${this.prefs.sessions} ${this.text("sessões concluídas","sessions completed")}`))
      .child(this.button("focus",this.deadline !== null ? this.text("Pausar foco","Pause focus") : this.text("Iniciar / continuar foco","Start / resume focus"),() => {
        if (this.deadline !== null) { this.remaining=Math.max(0,Math.ceil((this.deadline-Date.now())/1000)); this.deadline=null; }
        else { if (this.remaining === 0) this.remaining=1500; this.deadline=Date.now()+this.remaining*1000; }
      }))
      .child(this.button("reset",this.text("Reiniciar 25 minutos","Reset 25 minutes"),() => { this.deadline=null; this.remaining=1500; }))
      .child(div().text_size(10).text_color(theme().muted).whitespace_normal().child(this.text("Silencioso pausa comentários de trabalho. Avisos de atenção continuam ativos. O timer reinicia ao fechar o layout.","Quiet pauses work commentary. Attention alerts stay enabled. Timer resets when the layout closes.")));
  }
  render() {
    if (this.agentList) {
      this.prefs = restorePreferences(shared(PREFS_KEY));
      const list = this.list();
      setAgentOrder(list.map(a => a.address));
      const findSidebar = node => node?.id === "sidebar" ? node : node?.children?.map(findSidebar).find(Boolean);
      if ((findSidebar(layout())?.size?.px ?? 228) < 160) return div().id("ember-task-rail").size_full().min_h(0).overflow_y_scroll().flex().flex_col().gap(4).p(3)
        .children(list.map((agent,index) => div().id(`task-${agent.address}`).h(28).flex_none().rounded(5).flex().items_center().justify_center().text_size(12).text_color(theme()[agent.status] || theme().foreground).cursor_pointer()
          .tooltip(`${statusText(agent.status,this.prefs.language)} · ${agent.task} · ${agent.spaceName}`)
          .child(String(index+1)).on_click((_e,cx) => { this.focusAgent(agent.address); cx.notify(); })));
      return div().id("ember-task-list").size_full().min_h(0).min_w(0).flex().flex_col().gap(6).p(8).text_color(theme().foreground)
        .child(div().text_size(11).text_color(theme().muted).child(this.scopeLabel()))
        .child(div().id("ember-task-scroll").flex_1().min_h(0).overflow_y_scroll().flex().flex_col().gap(6)
          .when(list.length === 0,el => el.child(div().text_size(12).whitespace_normal().child(this.text("Nenhum agente neste escopo.","No agents in this scope."))))
          .children(this.groupedRows(list,"task")));
    }
    if (this.panel === "setup") return this.renderSetup();
    const t = theme();
    const list = this.list();
    this.reconcileBubble(list);
    const attention = list.filter(a => a.status === "blocked" || a.status === "done").length;
    const snoozed = this.prefs.snoozeUntil > Date.now();
    const snoozeMinutes = Math.ceil((this.prefs.snoozeUntil-Date.now())/60000);
    if (this.prefs.compact) {
      const path = this.prefs.character === "animated" ? animationFrame(this.asleep ? "sleeping" : list[0]?.status || "idle",Date.now(),this.prefs.motion) : `mods/ember-companion/ember-${this.asleep ? "chibi" : MOODS[list[0]?.status || "idle"]}.png`;
      return div().id("ember-compact").w(64).p(4).flex().flex_col().gap(3).text_color(t.foreground).cursor_pointer()
        .tooltip(this.text(`${attention} agentes para conferir. Clique para abrir.`,`${attention} agents to review. Click to expand.`))
        .child(image(path).w(52).h(56))
        .when(attention > 0,el => el.child(div().id("attention-badge").rounded(8).bg(list.some(a => a.status === "blocked") ? t.blocked : t.done).text_color(t.background).text_center().text_size(12).child(String(attention))))
        .when(snoozed,el => el.child(div().text_size(10).text_center().child(`${snoozeMinutes}m`)))
        .on_click((_e,cx) => { this.expand(); cx.notify(); });
    }
    const status = list[0]?.status || "idle";
    const bubble = this.bubble;
    const target = bubble?.target ? list.find(a => a.address === bubble.target) : list.find(a => a.status === "blocked" || a.status === "done");
    const mood = bubble?.mood || MOODS[status];
    const animationState = this.asleep ? "sleeping" : bubble?.event?.status || (bubble?.mood === "happy" ? "done" : status);
    const path = this.prefs.character === "animated" ? animationFrame(animationState,Date.now(),this.prefs.motion) : `mods/ember-companion/ember-${this.asleep ? "chibi" : mood}.png`;
    const size = this.asleep ? 52 : this.panel === "closed" ? this.prefs.size : Math.min(this.prefs.size,100);
    const avatar = image(path).w(Math.round(size*0.923)).h(size).relative().when(this.prefs.motion && !this.asleep,el => el.loop("top",{from:0,to:-4,period:2400}));
    const visibleText = bubble ? bubble.revealed ? bubble.text : bubble.text.slice(0,Math.max(1,Math.floor((Date.now()-bubble.start)/30))) : "";
    return div().id("ember-panel").w(280).flex().flex_col().p(12).gap(8).text_color(t.foreground)
      .when(Boolean(bubble) && !this.asleep && this.panel === "closed",el => el.child(div().id("speech").w_full().min_w(0).max_h(150).overflow_y_scroll().px(14).py(12).rounded(18).bg("#FFF9EE").text_size(13).text_color("#302438").whitespace_normal().cursor_pointer().child(visibleText).on_click((_e,cx) => { this.advanceBubble(); cx.notify(); })))
      .child(div().id("ember-avatar").flex().justify_center().cursor_pointer().child(avatar).on_click((_e,cx) => { if (!this.asleep) this.say(this.line("headpat")); cx.notify(); }))
      .when(Boolean(target) && !this.asleep,el => el.child(this.button("agent",this.text("Ver agente","View agent"),() => this.focusAgent(target.address))))
      .child(div().flex().gap(5).justify_center()
        .child(this.button(snoozed ? "resume-alerts" : "snooze",snoozed ? this.text(`Retomar · ${snoozeMinutes} min`,`Resume · ${snoozeMinutes} min`) : this.text("Pausar 30 min","Snooze 30 min"),() => { if (snoozed) this.resumeAlerts(); else this.snooze(); })
          .tooltip(this.text("Pausa só os avisos dos agentes. Histórico e timer continuam.","Snooze pauses agent alerts. History and your timer continue.")))
        .child(this.button("compact",this.text("Retrato","Portrait"),() => this.collapse())))
      .child(this.button("summary",this.text("O que está acontecendo?","What's happening?"),() => this.togglePanel("summary")))
      .child(div().flex().gap(5).justify_center()
        .child(this.button("history",this.text("Histórico","History"),() => this.togglePanel("history")))
        .child(this.button("controls",this.text("Ajustes +","Settings +"),() => this.togglePanel("settings")))
        .child(this.button(this.asleep ? "wake" : "sleep",this.asleep ? this.text("Acordar","Wake") : "Zzz",() => { if (this.asleep) this.captureSilently(); this.asleep=!this.asleep; this.bubble=null; this.model.prune(this.prefs,this.currentSpace(),this.suppressed(),Date.now()); this.panel="closed"; })))
      .when(this.panel !== "closed",el => el.child(this.button("close-panel",this.text("Fechar","Close"),() => { this.panel="closed"; })))
      .when(this.panel === "summary",el => el.child(this.renderSummary(list)))
      .when(this.panel === "history",el => el.child(this.renderHistory(list)))
      .when(this.panel === "settings",el => el.child(this.renderSettings()));
  }
}
