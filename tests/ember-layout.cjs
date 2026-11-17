const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const typesPath = [process.env.GPUI_KIT_TYPES, 'gpui-kit.d.ts', require('node:path').join(process.env.HERDR_APP_HOME || require('node:path').join(require('node:os').homedir(), '.config/herdr-app'), 'gpui-kit.d.ts')].find(p => p && require('node:fs').existsSync(p));
if (!typesPath) throw new Error('gpui-kit.d.ts not found: install Herdr desktop or set GPUI_KIT_TYPES');
const tree = JSON.parse(fs.readFileSync('layouts/ember-companion.json','utf8'));
const find = (node,id) => node.id === id ? node : (node.children || []).map(child=>find(child,id)).find(Boolean);
const stack = find(tree,'agents');
assert.equal(stack.type,'stack');
assert.equal(stack.header.content.mod,'ember-agent-tabs');
assert.equal(stack.header.height,30);
assert.equal(find(stack,'Tasks').content.props.view,'agents');
assert.equal(find(stack,'Agents').content.mod,'agents');
const types=fs.readFileSync(typesPath,'utf8');
const controls = new Map();
let calls=[];
function element() {
  let id;
  const proxy = new Proxy({}, {get(_target,key) {
    assert(types.includes(String(key)+'<') || types.includes(String(key)+'('),`Unknown GPUI method ${key}`);
    return (...args)=>{
      if(key==='id') id=args[0];
      if(key==='on_click') controls.set(id,args[0]);
      return proxy;
    };
  }});
  return proxy;
}
const context={View:class {},div:element,layout:()=>tree,theme:()=>({}),run:(command,args)=>calls.push({command,args})};
vm.createContext(context);
vm.runInContext(fs.readFileSync('mods/ember-agent-tabs/main.js','utf8').replace(/^import .*;\n/gm,'').replace('export default class EmberAgentTabs','globalThis.EmberAgentTabs = class EmberAgentTabs'),context);
new context.EmberAgentTabs().render();
for(const child of ['Tasks','Agents']) {
  controls.get(`ember-tab-${child}`)();
  assert.equal(JSON.stringify(calls.pop()),JSON.stringify({command:'layout.select',args:{stack:'agents',child}}));
}
console.log('Passed structured stack header, preserved Tasks/Agents views, native methods, and explicit tab commands.');
