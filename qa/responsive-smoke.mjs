import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const profile = await mkdtemp(join(tmpdir(), 'codex-fiddy-responsive-'));
const chrome = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--enable-unsafe-swiftshader', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
const browserErrors = [];
let socket;
let session;
let sequence = 0;

const send = (method, params = {}, sessionId = session) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`${method} timed out`));
  }, 15000);
  pending.set(id, {
    resolve: value => { clearTimeout(timer); resolve(value); },
    reject: error => { clearTimeout(timer); reject(error); },
  });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};

const waitFor = async (predicate, label, timeout = 20000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await evaluate(`(${predicate})()`);
    if (value) return;
    await delay(30);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const resize = async (width, height, mobile = true) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
  await delay(80);
};

const snapshot = () => evaluate(`(() => {
  const rect = element => {
    const value = element.getBoundingClientRect();
    return { x:value.x, y:value.y, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
  };
  const visible = element => {
    const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
  };
  const controls = [...document.querySelectorAll('.toy button,.toy a,.toy input[type="range"]')]
    .filter(visible).map(element => ({ name:element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName, ...rect(element) }));
  const stage = rect(document.querySelector('.toy'));
  const canvas = rect(document.querySelector('.toy-canvas'));
  const motion = document.querySelector('.astra-motion-controls');
  const dock = document.querySelector('.interaction-dock');
  return {
    viewport:{ width:innerWidth, height:innerHeight },
    document:{ width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight },
    body:{ width:document.body.scrollWidth, height:document.body.scrollHeight },
    stage, canvas, controls,
    coarse:matchMedia('(pointer:coarse)').matches,
    appHeight:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-height')),
    motion:motion && visible(motion) ? rect(motion) : null,
    dock:dock && visible(dock) ? rect(dock) : null,
  };
})()`);

const intersects = (a, b) => a && b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
const routes = [
  'butter', 'jelly', 'cushion', 'putty', 'dough', 'loop', 'star', 'dumpling',
  'ascii-tide', 'liquid-light', 'astra-swirl', 'astra-cursor', 'magnetic-dust',
  'silk', 'jelly-slice', 'jelly-prism',
];
const complexRoutes = ['jelly', 'ascii-tide', 'astra-swirl', 'astra-cursor', 'magnetic-dust', 'silk', 'jelly-slice'];
const matrix = [
  { width: 320, height: 568, mobile: true, routes },
  { width: 568, height: 320, mobile: true, routes },
  { width: 280, height: 653, mobile: true, routes: complexRoutes },
  { width: 430, height: 300, mobile: true, routes: complexRoutes },
  { width: 768, height: 1024, mobile: true, routes: complexRoutes },
  { width: 1366, height: 768, mobile: false, routes: complexRoutes },
];

try {
  let portInfo;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      portInfo = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      break;
    } catch { await delay(100); }
  }
  assert.ok(portInfo, 'Chrome did not start');
  socket = new WebSocket(`ws://127.0.0.1:${portInfo[0]}${portInfo[1]}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      browserErrors.push(message);
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
  ({ sessionId: session } = await send('Target.attachToTarget', { targetId, flatten: true }, null));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  let checks = 0;
  for (const entry of matrix) {
    await resize(entry.width, entry.height, entry.mobile);
    for (const route of entry.routes) {
      await send('Page.navigate', { url: `${origin}/?toy=${route}&renderer=webgl` });
      await waitFor("() => document.querySelector('.toy-player.is-ready') !== null", `${route} at ${entry.width}x${entry.height}`);
      const state = await snapshot();
      const label = `${route} at ${entry.width}x${entry.height}`;
      assert.deepEqual(state.viewport, { width: entry.width, height: entry.height }, `${label}: viewport mismatch`);
      assert.deepEqual(state.document, state.viewport, `${label}: document overflow`);
      assert.deepEqual(state.body, state.viewport, `${label}: body overflow`);
      assert.equal(Math.round(state.stage.width), entry.width, `${label}: stage width`);
      assert.equal(Math.round(state.stage.height), entry.height, `${label}: stage height`);
      assert.equal(Math.round(state.canvas.width), entry.width, `${label}: canvas width`);
      assert.equal(Math.round(state.canvas.height), entry.height, `${label}: canvas height`);
      assert.ok(Math.abs(state.appHeight - entry.height) <= 1, `${label}: measured mobile viewport height`);
      for (const control of state.controls) {
        assert.ok(control.x >= -.5 && control.y >= -.5 && control.right <= entry.width + .5 && control.bottom <= entry.height + .5,
          `${label}: ${control.name} is outside the viewport`);
        if (entry.mobile) assert.ok(control.width >= 44 && control.height >= 44, `${label}: ${control.name} is too small to touch`);
      }
      if (entry.width <= 479 && entry.height <= 450 && route.startsWith('astra-')) {
        assert.equal(intersects(state.motion, state.dock), false, `${label}: motion controls overlap the app dock`);
      }
      if (entry.mobile) assert.equal(state.coarse, true, `${label}: touch media query is inactive`);
      checks++;
    }
  }

  await resize(320, 568, true);
  await send('Page.navigate', { url: `${origin}/?toy=jelly&renderer=webgl` });
  await waitFor("() => document.querySelector('.toy-player.is-ready') !== null", 'collection player');
  await evaluate("document.querySelector('.collection-trigger').click()");
  await waitFor("() => document.querySelector('.collection-dialog')?.open === true", 'collection dialog');
  const collection = await evaluate(`(() => {
    const dialog=document.querySelector('.collection-dialog'), list=document.querySelector('.collection-list');
    const close=document.querySelector('.close-collection').getBoundingClientRect(), bounds=dialog.getBoundingClientRect();
    const columns=getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length;
    list.scrollTop=list.scrollHeight;
    return {bounds:{x:bounds.x,y:bounds.y,right:bounds.right,bottom:bounds.bottom},close:{x:close.x,y:close.y,right:close.right,bottom:close.bottom},columns,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,scrollTop:list.scrollTop};
  })()`);
  assert.equal(collection.columns, 1, 'Narrow collection should use one list column');
  assert.ok(collection.clientHeight >= 80 && collection.scrollHeight > collection.clientHeight, 'Collection needs a usable internal scroll region');
  assert.ok(collection.scrollTop > 0, 'Collection did not scroll internally');
  for (const bounds of [collection.bounds, collection.close]) {
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= 320 && bounds.bottom <= 568, 'Collection escaped the phone viewport');
  }
  await resize(568, 320, true);
  const rotatedColumns = await evaluate("getComputedStyle(document.querySelector('.collection-list')).gridTemplateColumns.split(' ').filter(Boolean).length");
  assert.equal(rotatedColumns, 2, 'Landscape collection should use two columns');
  assert.equal(browserErrors.length, 0, JSON.stringify(browserErrors));
  console.log(`Responsive browser checks passed (${checks} player layouts plus collection scroll and rotation).`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close', {}, null); } catch {}
    socket.close();
  }
  await delay(300);
  if (chrome.exitCode === null) chrome.kill();
}
