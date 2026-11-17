const {readFileSync, existsSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const typesPath = [process.env.GPUI_KIT_TYPES, 'gpui-kit.d.ts', require('node:path').join(process.env.HERDR_APP_HOME || require('node:path').join(require('node:os').homedir(), '.config/herdr-app'), 'gpui-kit.d.ts')].find(p => p && require('node:fs').existsSync(p));
if (!typesPath) throw new Error('gpui-kit.d.ts not found: install Herdr desktop or set GPUI_KIT_TYPES');
const types = readFileSync(typesPath,'utf8');
const data = new Map();
let sidebarWidth = 228;
let live = [], currentSpace = 'project', viewProps = {}, now = 100000, notifications = [], commands = [], order = [], spawned = 0;
class Clock extends Date { constructor(value) { super(value === undefined ? now : value); } static now() { return now; } }
function element(kind='div', source) {
  const record = {kind, source, childNodes:[], attrs:{}, handlers:{}};
  let proxy;
  proxy = new Proxy(record, {get(target,key) {
    if (key in target) return target[key];
    assert(types.includes(String(key)+'<') || types.includes(String(key)+'('), `Unknown GPUI method ${String(key)}`);
    return (...args) => {
      if (key === 'child') record.childNodes.push(args[0]);
      else if (key === 'children') record.childNodes.push(...args[0]);
      else if (key === 'when') { if (args[0]) args[1](proxy); }
      else if (key === 'on_click') record.handlers.click = args[0];
      else record.attrs[key] = args;
      return proxy;
    };
  }});
  return proxy;
}
const context = {View:class {}, Date:Clock, Map, Math, Number, String, Boolean, Object, Array,
  div:()=>element(), image:path=>{assert(existsSync(path),`Missing image ${path}`);return element('image',path);},
  layout:()=>({id:'root',children:[{id:'sidebar',size:{px:sidebarWidth}}]}), theme:()=>({}), agents:()=>live, focused:()=>currentSpace ? {space:currentSpace} : null, props:()=>viewProps,
  shared:key=>data.get(key), setShared:(key,value)=>data.set(key,JSON.parse(JSON.stringify(value))),
  notify:value=>notifications.push(value), run:(name,args)=>commands.push({name,args}), setAgentOrder:value=>{order=[...value];}};
vm.createContext(context);
for (const file of ['model.js','animation.js','voice.js','main.js']) {
  const source = readFileSync(`mods/ember-companion/${file}`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class EmberCompanion','globalThis.EmberCompanion = class EmberCompanion').replace(/^export /gm,'');
  vm.runInContext(source,context,{filename:file});
}
const {EmberCompanion:Companion} = context;
const {ActivityModel, restorePreferences, agentSnapshot, scopedAgents, PREFS_KEY, JOURNAL_KEY} = vm.runInContext('({ActivityModel,restorePreferences,agentSnapshot,scopedAgents,PREFS_KEY,JOURNAL_KEY})',context);
const agent = (address,status='working',title='Fix login',space='project')=>({address,status,title,space,space_name:space,tab_name:'1',program:{name:'Codex',key:'codex'}});
const prefs = restorePreferences({language:'en',setupComplete:true});
const find = (tree,id) => typeof tree === 'object' && tree && (tree.attrs?.id?.[0] === id ? tree : tree.childNodes.map(c=>find(c,id)).find(Boolean));
const text = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? tree.childNodes.map(text).join(' ') : '';
const nodes = tree => typeof tree === 'object' && tree ? [tree,...tree.childNodes.flatMap(nodes)] : [];
const click = (view,id) => { const node=find(view.render(),id); assert(node,`Rendered control ${id}`); assert(node.handlers.click,`Clickable ${id}`); node.handlers.click({}, {notify(){}}); };
const init = (role={}) => {viewProps=role; const view=new Companion();view.init(undefined,{spawn(){spawned++;}});return view;};

assert.equal(agentSnapshot(agent('a','working','  ✨ Fix\n login  ')).task,'Fix login');
assert.equal(agentSnapshot({...agent('a','working','/home/code'),tab_name:'Repair auth'}).task,'Repair auth');
assert.equal(agentSnapshot(agent('a','working','Codex')).task,'Codex · a');
assert.equal(agentSnapshot(agent('b','working','42')).task,'Codex · b');
assert.equal(restorePreferences({scope:'invalid',motion:'yes',size:-1,sessions:-1}).scope,'all');
assert.equal(restorePreferences({motion:'yes'}).motion,true);
assert.equal(scopedAgents([agent('a'),agent('b','working','Other','elsewhere')],{...prefs,scope:'current'},null).length,0);

const model = new ActivityModel();
model.observe([agent('a'),agent('b','blocked'),agent('c','done')],prefs,'project',now);
assert.equal(model.takeNotice(prefs,'project',now).address,'b');
assert.equal(model.takeNotice(prefs,'project',now).address,'c');
assert.equal(model.takeNotice(prefs,'project',now).address,'a');
model.observe([agent('a','working','Add tests')],prefs,'project',now+1000);
assert.equal(model.takeNotice(prefs,'project',now+1000),null,'work throttled');
assert.equal(model.takeNotice(prefs,'project',now+60000).task,'Add tests','queued latest work delivered');
const count=model.history.length;
model.observe([agent('a','working','Add tests')],prefs,'project',now+61000);
assert.equal(model.history.length,count,'identical snapshot does not repeat');
const restored=new ActivityModel(JSON.parse(JSON.stringify(model.serialize())));
restored.observe([agent('a','working','Add tests')],prefs,'project',now+62000);
assert.equal(restored.history.length,count,'restored fingerprints prevent duplicates');
assert.equal(restored.takeNotice(prefs,'project',now+62000),null,'reload does not replay notices');
for (const override of [{quiet:true},{workUpdates:false}]) {
  const muted=new ActivityModel();
  muted.observe([agent('a')],{...prefs,...override},'project',now);
  assert.equal(muted.history.length,1,'muted work remains in history');
  assert.equal(muted.takeNotice(prefs,'project',now+60000),null,'unmuting does not replay');
}
const mutedDone=new ActivityModel();
mutedDone.observe([agent('a','done')],{...prefs,completionAlerts:false},'project',now);
assert.equal(mutedDone.takeNotice(prefs,'project',now),null);
const sleeping=new ActivityModel();
sleeping.observe([agent('a','blocked')],prefs,'project',now,true);
assert.equal(sleeping.history.length,1);
assert.equal(sleeping.takeNotice(prefs,'project',now+60000),null,'wake does not replay sleeping events');
const scoped=new ActivityModel();
scoped.observe([agent('a','blocked','Task','other')],{...prefs,scope:'current'},'project',now);
assert.equal(scoped.history.length,1);
assert.equal(scoped.takeNotice({...prefs,scope:'current'},'other',now),null,'scope change does not replay');
for (const status of ['blocked','done']) {
  const updated=new ActivityModel();
  updated.observe([agent('a',status,'Waiting')],prefs,'project',now);
  updated.observe([agent('a',status,'Updated request')],prefs,'project',now+1);
  const notice=updated.takeNotice(prefs,'project',now+2);
  assert.equal(notice.task,'Updated request','pending attention survives a metadata update');
}
const invalidHistory=new ActivityModel({version:1,events:[
  {...agentSnapshot(agent('a')),kind:'observed',at:8640000000000001},
  {...agentSnapshot(agent('a')),address:'   ',kind:'observed',at:now}
]});
assert.equal(invalidHistory.history.length,0,'invalid dates and blank addresses rejected');
const stale=new ActivityModel();
stale.observe([agent('a')],prefs,'project',now);
stale.observe([],prefs,'project',now+1);
assert.equal(stale.takeNotice(prefs,'project',now),null);
for(let i=0;i<100;i++) model.observe([agent('a','working',`Task ${i}`)],prefs,'project',now+i);
assert.equal(model.history.length,60);
assert.equal(model.history[0].task,'Task 40');
model.clear();assert.equal(model.history.length,0);
assert.equal(new ActivityModel({version:1,events:[null,{at:Infinity}],observed:[null]}).history.length,0);

live=[agent('a'),agent('b','blocked','Approve change','other'),agent('c','done','Review tests'),agent('d','idle','Waiting')];
data.set(PREFS_KEY,{...prefs});
const e=init();
assert.equal(spawned,1);
assert.equal(e.bubble.target,'b','initial attention outranks work');
click(e,'summary');
assert(find(e.render(),'ember-summary'));
assert.match(text(e.render()),/Working · 1/);
assert.match(text(e.render()),/Needs you · 1/);
click(e,'summary-a');
assert.equal(JSON.stringify(commands.pop()),JSON.stringify({name:'agent.focus',args:{terminal:'a'}}));
const staleRow=find(e.render(),'summary-a');
live=live.filter(a=>a.address!=='a');
const before=commands.length;
staleRow.handlers.click({}, {notify(){}});
assert.equal(commands.length,before,'removed target does not focus current terminal');
click(e,'history');
assert(!find(e.render(),'ember-summary'),'only one panel open');
assert(find(e.render(),'ember-history'));
assert.match(text(e.render()),/Agent unavailable/);
const historyEvent=e.model.history.find(a=>a.address==='c');
click(e,`history-focus-${historyEvent.id}`);
assert.equal(commands.pop().args.terminal,'c');
click(e,'controls');
assert(!find(e.render(),'ember-history'));
click(e,'scope');
assert.equal(e.prefs.scope,'current');
assert.equal(e.bubble,null,'out-of-scope active bubble cleared');
click(e,'workUpdates');
click(e,'completionAlerts');
assert.equal(e.prefs.workUpdates,false);assert.equal(e.prefs.completionAlerts,false);
click(e,'quiet');
click(e,'summary');
assert.match(text(e.render()),/Done · 1/,'summary available in quiet mode');
assert.doesNotMatch(text(find(e.render(),'ember-summary')),/Approve change/,'summary respects scope');
currentSpace=null;
assert.match(text(e.render()),/No agents in this scope/);
currentSpace='project';
click(e,'controls');
click(e,'character');
assert.equal(e.prefs.character,'animated');
assert(nodes(e.render()).some(n=>n.kind==='image' && n.source.includes('/animation/')));
click(e,'motion');
assert.equal(e.prefs.motion,false);
e.say('Static text');assert.equal(e.bubble.revealed,true);
assert(nodes(e.render()).filter(n=>n.kind==='image').every(n=>!n.attrs.loop),'reduced motion has no positional animation');
click(e,'sleep');
assert.equal(e.asleep,true);
assert(nodes(e.render()).some(n=>n.source?.includes('/sleeping-0.svg')));
click(e,'wake');assert.equal(e.asleep,false);
click(e,'history');click(e,'clear-history');
assert.equal(data.get(JOURNAL_KEY).events.length,0);
click(e,'controls');click(e,'coffee');assert.equal(e.coffee,1);assert.match(e.bubble.text,/Coffee acquired/);
click(e,'focus');assert.equal(e.deadline,now+1500000);
now=e.deadline;e.tick(now,live);e.tick(now+1000,live);
assert.equal(e.prefs.sessions,1);assert.equal(notifications.length,1);
click(e,'reset');assert.equal(e.remaining,1500);assert.equal(e.deadline,null);
e.prefs.motion=true;e.say('Click to reveal','happy',null,now);e.advanceBubble(now+1);assert.equal(e.bubble.revealed,true);e.advanceBubble(now+2);assert.equal(e.bubble,null);
e.say('Expires','happy',null,now);e.tick(now+30000,[]);assert.equal(e.bubble,null);

const priority=new Companion();
priority.prefs=prefs;
priority.observe([agent('completed','done')],now);
assert.equal(priority.bubble.target,'completed');
priority.observe([agent('completed','done'),agent('urgent','blocked')],now+1);
assert.equal(priority.bubble.target,'urgent','blocked interrupts a completion bubble');
priority.say('User requested speech');
priority.observe([agent('another','blocked')],now+2);
assert.equal(priority.bubble.text,'User requested speech','casual interaction is preserved');
const writesBefore=JSON.stringify([...data]);
const spawnsBefore=spawned;
live=[agent('x','working','Shared label'),agent('y','blocked','Urgent'),agent('z','working','Outside','other')];
const sidebar=init({view:'agents'});
assert.equal(spawned,spawnsBefore,'passive list starts no polling');
const sidebarTree=sidebar.render();
assert.equal(JSON.stringify([...data]),writesBefore,'passive list writes no journal or settings');
assert.deepEqual(order,['y','x']);
assert.match(text(sidebarTree),/Shared label/);
click(sidebar,'task-x');assert.equal(commands.pop().args.terminal,'x');
sidebarWidth=44;
assert(find(sidebar.render(),'ember-task-rail'),'compact sidebar renders a rail');
assert.equal(text(find(sidebar.render(),'task-x')),'2');
assert.match(find(sidebar.render(),'task-x').attrs.tooltip[0],/Shared label/);
click(sidebar,'task-x');assert.equal(commands.pop().args.terminal,'x');
sidebarWidth=228;
const sidebarStale=find(sidebar.render(),'task-x');
currentSpace='other';
sidebarStale.handlers.click({}, {notify(){}});
assert.equal(commands.length,before,'scope is rechecked on clicks');
currentSpace='project';
const again=init();
assert.equal(again.prefs.character,'animated');assert.equal(again.prefs.motion,false);assert.equal(again.prefs.sessions,1);
console.log('Passed model events, labels, bounded persistence, restore, priority, throttling, mute/sleep/scope, summaries, history, native controls, safe clicks, timer, animation and passive sidebar.');


currentSpace='project'; live=[agent('onboard','blocked','Review login','project')];
data.clear(); data.set(PREFS_KEY,{language:'pt',size:220,motion:false});
const onboard=init();
assert(find(onboard.render(),'ember-setup'),'existing preferences without setup version show introduction');
assert.equal(onboard.prefs.size,220,'setup preserves existing size');
assert.equal(onboard.bubble,null,'setup suppresses automatic attention');
const realEvents=onboard.model.history.length;
click(onboard,'setup-en');assert.equal(onboard.prefs.language,'en');
click(onboard,'setup-animated');assert.equal(onboard.prefs.character,'animated');
assert(nodes(onboard.render()).some(n=>n.source?.includes('/animation/')));
click(onboard,'setup-preview');
assert.match(text(onboard.render()),/SAMPLE.*Codex needs your attention in Website/);
assert.doesNotMatch(text(onboard.render()),/needs your approval/);
assert.equal(onboard.bubble,null,'preview is not a real bubble');
assert.equal(onboard.model.history.length,realEvents,'preview creates no journal entry');
assert(!find(onboard.render(),'agent'),'preview has no agent action');
click(onboard,'setup-finish');
assert.equal(onboard.prefs.setupComplete,true);
assert.equal(onboard.setupPreview,false);
assert(!find(onboard.render(),'setup-sample'));
onboard.observe(live,now);assert.equal(onboard.bubble,null,'setup does not replay suppressed alert');
const started=init();assert(!find(started.render(),'ember-setup'),'setup completion persists');
click(started,'controls');click(started,'setup-open');
assert(find(started.render(),'ember-setup'));
click(started,'setup-pt');click(started,'setup-illustrated');click(started,'setup-skip');
assert.equal(started.prefs.language,'pt');assert.equal(started.prefs.character,'illustrated');
assert.equal(started.prefs.setupComplete,true,'skip marks introduction complete');
started.save({language:'en',quiet:false,workUpdates:true,completionAlerts:true});
started.bubble=null;
click(started,'snooze');
const until=now+1800000;
assert.equal(started.prefs.snoozeUntil,until);
assert.equal(started.prefs.quiet,false,'snooze leaves quiet preference unchanged');
live=[agent('snoozed','blocked','Needs help')];started.observe(live,now+1);
assert.equal(started.bubble,null);
assert(started.model.history.some(e=>e.address==='snoozed'),'snoozed update recorded');
const snoozedReload=init();assert.equal(snoozedReload.prefs.snoozeUntil,until);
assert.equal(snoozedReload.bubble,null,'snooze suppresses startup greeting on reload');
assert.match(text(snoozedReload.render()),/30 min/);
now=until;snoozedReload.tick(now,live);
assert.equal(snoozedReload.prefs.snoozeUntil,0,'snooze expires automatically');
assert.equal(snoozedReload.bubble,null,'expiry has no backlog');
assert.equal(snoozedReload.prefs.completionAlerts,true);
live=[agent('snoozed','done','Review result')];snoozedReload.observe(live,now+1);
assert.match(snoozedReload.bubble.text,/Codex finished in project.*Reported task: Review result/);
click(snoozedReload,'snooze');assert.equal(snoozedReload.bubble,null);
click(snoozedReload,'resume-alerts');assert.equal(snoozedReload.prefs.snoozeUntil,0);
snoozedReload.observe(live,now+2);assert.equal(snoozedReload.bubble,null,'manual resume has no backlog');
click(snoozedReload,'snooze');
live=[agent('urgent','blocked'),agent('finished','done'),agent('else','blocked','Elsewhere','other')];
snoozedReload.save({scope:'current',character:'animated',motion:false});
click(snoozedReload,'compact');
assert.equal(snoozedReload.prefs.compact,true);
assert.equal(find(snoozedReload.render(),'ember-compact').attrs.w[0],64);
assert.equal(text(find(snoozedReload.render(),'attention-badge')),'2','badge reflects scope and includes done');
assert(!find(snoozedReload.render(),'speech'),'compact never shows speech');
snoozedReload.observe(live,now+3);assert.equal(snoozedReload.bubble,null);
assert(snoozedReload.model.history.some(e=>e.address==='urgent'));
assert(nodes(snoozedReload.render()).every(n=>!n.attrs.loop),'compact reduced motion has no loops');
const compactReload=init();assert(find(compactReload.render(),'ember-compact'),'compact mode persists');
assert.equal(compactReload.bubble,null);
click(compactReload,'ember-compact');
assert.equal(compactReload.prefs.compact,false);assert.equal(compactReload.panel,'summary');
assert(find(compactReload.render(),'summary-urgent'));
assert(!find(compactReload.render(),'summary-else'));
click(compactReload,'summary-urgent');assert.equal(commands.pop().args.terminal,'urgent');
click(compactReload,'compact');currentSpace=null;
assert(!find(compactReload.render(),'attention-badge'),'no focused space means no scoped badge');
click(compactReload,'ember-compact');assert.equal(compactReload.panel,'closed');
currentSpace='project';
click(compactReload,'controls');
click(compactReload,'coffee');const coffeeLine=compactReload.bubble.text;
click(compactReload,'coffee');assert.notEqual(compactReload.bubble.text,coffeeLine,'coffee line rotates');
const next=init();click(next,'controls');click(next,'coffee');
assert.notEqual(next.bubble.text,compactReload.bubble.text,'voice rotation survives reload');
next.panel='closed';click(next,'ember-avatar');const pat=next.bubble.text;click(next,'ember-avatar');assert.notEqual(next.bubble.text,pat);
assert.equal(restorePreferences({snoozeUntil:Infinity,compact:'yes',setupComplete:'yes'}).snoozeUntil,0);
assert.equal(restorePreferences({compact:'yes'}).compact,false);
console.log('Passed introduction, sample isolation, migration, clear alert reasons, snooze expiry/persistence, portrait badge/scope, safe expansion and persistent voice rotation.');


for (const mode of ['compact','setup','resume','expiry','sleep']) {
  currentSpace='project';live=[agent('gap','working','Before')];
  data.set(PREFS_KEY,{...prefs});data.delete(JOURNAL_KEY);
  const gap=init();gap.bubble=null;
  if (mode === 'compact') gap.collapse();
  else if (mode === 'setup') gap.openSetup();
  else if (mode === 'sleep') click(gap,'sleep');
  else gap.snooze();
  live=[agent('gap','blocked','Changed between polls')];
  if (mode === 'compact') gap.expand();
  else if (mode === 'setup') gap.finishSetup();
  else if (mode === 'resume') gap.resumeAlerts();
  else if (mode === 'sleep') click(gap,'wake');
  else { now=gap.prefs.snoozeUntil;gap.tick(now,live); }
  gap.observe(live,now+1);
  assert.equal(gap.bubble,null,`${mode} exit captures the unpolled suppressed transition`);
  assert(gap.model.history.some(e=>e.task==='Changed between polls'),'suppressed boundary transition remains in history');
  live=[agent('gap','done','New after resume')];gap.observe(live,now+2);
  assert.equal(gap.bubble.target,'gap','subsequent events resume normally');
}
console.log('Passed no-poll transition gaps at compact, setup, snooze, expiry, and sleep boundaries.');
