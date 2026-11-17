const { readFileSync, existsSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync('mods/ember-companion/animation.js', 'utf8')
  .replace(/^export /gm, '');
const context = { Math, Number, Object };
vm.createContext(context);
vm.runInContext(source, context);
const frame = context.animationFrame;
for (const state of ['idle', 'working', 'blocked', 'done', 'sleeping']) {
  const paths = new Set();
  const still = frame(state, 0, false);
  for (let time = 0; time < 8000; time += 100) {
    const path = frame(state, time, true);
    assert(existsSync(path), `${state} frame exists at ${time}`);
    assert.match(readFileSync(path, 'utf8'), /<svg[^>]+viewBox="0 0 208 230"/);
    assert.equal(frame(state, time, false), still, 'reduced motion stays static');
    paths.add(path);
  }
  assert(paths.size > 1, `${state} animates`);
  assert(new Set([...paths].map(path => readFileSync(path, 'utf8'))).size > 1, `${state} changes visibly`);
}
assert.match(frame('idle', 3400), /idle-2/);
assert.match(frame('idle', 3600), /idle-0/);
assert.equal(frame('missing', 0), frame('idle', 0));
assert.equal(frame('__proto__', 0), frame('idle', 0));
assert.equal(frame('idle', Infinity), frame('idle', 0));
assert.equal(frame('idle', -100), frame('idle', 0));
assert.doesNotMatch(readFileSync(frame('sleeping', 0), 'utf8'), /rx="8" ry="12"/);
console.log('Passed native animation assets, visible frame changes, blink timing, closed-eye sleep, reduced motion, and fallback.');
