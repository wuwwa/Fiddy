import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBodyAudio, type AudioMotion } from '../src/soft-body/audio.ts';
import type { FoleyBank, FoleyLoader } from '../src/audio/foley.ts';

class FakeParam {
  private current = 0;
  readonly values: number[] = [];
  constructor(readonly name: string) {}
  get value() { return this.current; }
  set value(value: number) {
    assert.ok(Number.isFinite(value), `${this.name} received ${value}`);
    this.current = value; this.values.push(value);
  }
  private at(value: number, time: number) {
    assert.ok(Number.isFinite(time) && time >= 0, `Invalid automation time ${time}`);
    this.value = value;
    return this;
  }
  setValueAtTime(value: number, time: number) { return this.at(value, time); }
  linearRampToValueAtTime(value: number, time: number) { return this.at(value, time); }
  exponentialRampToValueAtTime(value: number, time: number) {
    assert.ok(value > 0, 'Exponential ramps require a positive target');
    return this.at(value, time);
  }
  setTargetAtTime(value: number, time: number, timeConstant: number) {
    assert.ok(Number.isFinite(timeConstant) && timeConstant > 0);
    return this.at(value, time);
  }
  cancelScheduledValues(time: number) { assert.ok(Number.isFinite(time) && time >= 0); return this; }
  cancelAndHoldAtTime(time: number) { return this.cancelScheduledValues(time); }
}

class FakeNode {
  readonly outputs = new Set<FakeNode>();
  connections = 0;
  disconnections = 0;
  constructor(readonly context: FakeContext, readonly kind: string) {}
  connect(target: FakeNode) { this.outputs.add(target); this.connections++; return target; }
  disconnect() { this.outputs.clear(); this.disconnections++; }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam('gain');
  constructor(context: FakeContext) { super(context, 'gain'); }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam('filter frequency');
  readonly Q = new FakeParam('filter Q');
  readonly detune = new FakeParam('filter detune');
  readonly gain = new FakeParam('filter gain');
  constructor(context: FakeContext) { super(context, 'filter'); }
}

class FakeSource extends FakeNode {
  started = false;
  ended = false;
  stopAt = Infinity;
  onended: (() => void) | null = null;
  type = 'sine';
  loop = false;
  buffer: FakeBuffer | null = null;
  readonly frequency = new FakeParam('oscillator frequency');
  readonly detune = new FakeParam('source detune');
  readonly playbackRate = new FakeParam('playback rate');
  start(time = 0, offset = 0) {
    assert.ok(Number.isFinite(offset) && offset >= 0);
    assert.ok(!this.started && Number.isFinite(time) && time >= 0);
    this.started = true;
  }
  stop(time = 0) {
    assert.ok(Number.isFinite(time) && time >= 0);
    this.stopAt = time;
  }
  finish() {
    if (!this.ended && this.started && this.stopAt <= this.context.currentTime) {
      this.ended = true; this.onended?.();
    }
  }
}

class FakeBuffer {
  readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    assert.ok(length > 0 && Number.isFinite(length));
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(channel: number) { return this.data[channel]; }
  copyToChannel(data: Float32Array, channel: number) { this.data[channel].set(data); }
}

class FakeContext {
  currentTime = 0;
  readonly sampleRate = 24_000;
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode(this, 'destination');
  readonly nodes: FakeNode[] = [];
  readonly sources: FakeSource[] = [];
  readonly buffers: FakeBuffer[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  private resumeGate: Promise<void> | null = null;
  private resolveGate: (() => void) | null = null;
  blockResume() {
    this.resumeGate = new Promise(resolve => { this.resolveGate = resolve; });
  }
  resolveResume() { this.resolveGate?.(); }
  async resume() {
    this.resumeCalls++;
    if (this.resumeGate) await this.resumeGate;
    if (this.state !== 'closed') this.state = 'running';
  }
  async close() { this.closeCalls++; this.state = 'closed'; }
  createGain() { const node = new FakeGain(this); this.nodes.push(node); return node; }
  createBiquadFilter() { const node = new FakeFilter(this); this.nodes.push(node); return node; }
  private source(kind: string) {
    const node = new FakeSource(this, kind); this.sources.push(node); this.nodes.push(node); return node;
  }
  createOscillator() { return this.source('oscillator'); }
  createBufferSource() { return this.source('buffer source'); }
  createBuffer(channels: number, length: number, rate: number) {
    const buffer = new FakeBuffer(channels, length, rate); this.buffers.push(buffer); return buffer;
  }
  advance(seconds: number) {
    this.currentTime += seconds;
    for (const source of this.sources) source.finish();
  }
  get activeSources() { return this.sources.filter(source => source.started && !source.ended); }
  get connectedNodes() { return this.nodes.filter(node => node.outputs.size > 0); }
  get masterConnections() { return this.nodes.filter(node => node.outputs.has(this.destination)); }
}

function makeBank(context: FakeContext): FoleyBank {
  const clip = (duration: number) => context.createBuffer(1, Math.round(context.sampleRate * duration), context.sampleRate) as unknown as AudioBuffer;
  return { press: [clip(.42), clip(.42)], release: [clip(.46), clip(.46)], pop: [clip(.38), clip(.48)], motion: clip(2.75) };
}

function audioFixture(pitch = 1, texture:'gel'|'putty'|'cloth'='gel', loader?: FoleyLoader) {
  const context = new FakeContext();
  let contextsCreated = 0;
  const audio = new SoftBodyAudio(pitch, () => { contextsCreated++; return context as unknown as AudioContext; },texture, loader ?? (async () => makeBank(context)));
  return { audio, context, contextsCreated: () => contextsCreated };
}

const moving: AudioMotion = { contacts: 2, compression: 0.35, stretch: 0.55, motion: 0.45, twist: 0.2 };
const still: AudioMotion = { contacts: 0, compression: 0, stretch: 0, motion: 0, twist: 0 };

test('recording variations rotate across presses without creating oscillators', async () => {
  const { audio, context } = audioFixture();
  await audio.setEnabled(true);
  audio.play('press'); context.advance(1);
  audio.play('press'); context.advance(1);
  audio.play('press');
  assert.notEqual(context.sources[0].buffer, context.sources[1].buffer);
  assert.equal(context.sources[0].buffer, context.sources[2].buffer);
  assert.ok(context.sources.every(source => source.kind === 'buffer source'));
  assert.notEqual(context.sources[0].playbackRate.value, context.sources[2].playbackRate.value);
  audio.dispose();
});

test('mute or disposal during recording downloads cannot start late audio', async () => {
  for (const action of ['mute', 'dispose']) {
    let resolve!: (bank: FoleyBank) => void;
    const { audio, context } = audioFixture(1, 'gel', () => new Promise(done => { resolve = done; }));
    const enabling = audio.setEnabled(true);
    assert.equal(context.resumeCalls, 1, 'Resume happens before download completes');
    audio.play('press'); audio.update(moving);
    assert.equal(context.sources.length, 0);
    if (action === 'mute') await audio.setEnabled(false); else audio.dispose();
    resolve(makeBank(context)); await enabling;
    assert.equal(audio.enabled, false); assert.equal(context.sources.length, 0);
    audio.dispose();
  }
});

test('failed recording downloads recover on the next enable, including failure after mute', async () => {
  for (const mute of [false, true]) {
    let reject!: (reason: Error) => void, attempts = 0;
    const { audio, context } = audioFixture(1, 'putty', async ctx => {
      attempts++;
      if (attempts === 1) return new Promise((_resolve, fail) => { reject = fail; });
      return makeBank(ctx as unknown as FakeContext);
    });
    const enabling = audio.setEnabled(true);
    if (mute) await audio.setEnabled(false);
    reject(new Error('Network lost'));
    if (mute) await enabling; else await assert.rejects(enabling, /Network lost/);
    assert.equal(audio.enabled, false);
    await audio.setEnabled(true); audio.play('press');
    assert.equal(audio.enabled, true); assert.equal(attempts, 2); assert.equal(context.activeSources.length, 1);
    audio.dispose();
  }
});

test('putty accents and rubbing remain quiet, reuse the gesture voice, and clean up after rapid input',async()=>{
  const {audio,context}=audioFixture(0.48,'putty');
  audio.play('press');assert.equal(context.sources.length,0);
  await audio.setEnabled(true);
  for(let i=0;i<100;i++) {
    audio.play(i%2?'release':'press');audio.update(moving);
    assert.ok(audio.diagnostics().transientVoices<=3);
    assert.ok(context.activeSources.length<=4);
    assert.equal(context.masterConnections.length,1);
    context.advance(0.025);
  }
  audio.update(still);context.advance(0.5);
  assert.equal(audio.diagnostics().transientVoices,0);assert.equal(audio.diagnostics().gestureActive,false);
  assert.equal(context.connectedNodes.length,1,'Only the master remains connected');
  audio.dispose();assert.equal(context.connectedNodes.length,0);
});

test('disabled sound is silent and does not create an audio context', async () => {
  const { audio, context, contextsCreated } = audioFixture();
  audio.play('press'); audio.play('release'); audio.play('pop'); audio.update(moving);
  await audio.setEnabled(false);
  audio.stop();
  assert.equal(audio.enabled, false);
  assert.equal(contextsCreated(), 0);
  assert.equal(context.nodes.length, 0);
  assert.deepEqual(audio.diagnostics(), { enabled: false, contextState: 'uninitialized', transientVoices: 0, gestureActive: false });
  audio.dispose();
  assert.equal(context.closeCalls, 0);
});

test('repeated and concurrent enabling creates one master connection', async () => {
  const { audio, context, contextsCreated } = audioFixture();
  try {
    await audio.setEnabled(true);
    await Promise.all([audio.setEnabled(true), audio.setEnabled(true), audio.setEnabled(true)]);
    assert.equal(audio.enabled, true);
    assert.equal(contextsCreated(), 1);
    assert.equal(context.masterConnections.length, 1);
    assert.equal(context.masterConnections[0].connections, 1);
    assert.equal(context.sources.length, 0, 'Enabling alone must not make a sound');
    await audio.setEnabled(false);
    await audio.setEnabled(true);
    assert.equal(contextsCreated(), 1);
    assert.equal(context.masterConnections.length, 1);
    assert.equal(context.masterConnections[0].connections, 1);
  } finally { audio.dispose(); }
});

test('one gesture voice is reused during continuous motion and stops when still', async () => {
  const { audio, context } = audioFixture();
  try {
    await audio.setEnabled(true);
    audio.update(moving);
    assert.equal(context.activeSources.length, 1, 'Movement uses one recorded texture');
    const sourcesCreated = context.sources.length, nodesCreated = context.nodes.length;
    for (let frame = 0; frame < 240; frame++) {
      context.advance(1 / 60);
      audio.update({ ...moving, contacts: frame % 5 + 1, motion: 0.2 + Math.sin(frame * 0.17) ** 2 });
    }
    assert.equal(context.sources.length, sourcesCreated);
    assert.equal(context.nodes.length, nodesCreated, 'An animation update must not allocate a new audio graph');
    for (let frame = 0; frame < 60; frame++) {
      context.advance(0.05);
      audio.update({ ...moving, motion: 0 });
    }
    context.advance(1);
    assert.equal(context.activeSources.length, 0, 'A stationary hold should fall silent');
    assert.equal(context.connectedNodes.length, 1, 'Stopped gesture nodes must disconnect from the master');
    audio.update(moving);
    assert.equal(context.activeSources.length, 1, 'Movement should restart a single gesture voice');
    audio.update(still);
    context.advance(2); audio.update(still); context.advance(1);
    assert.equal(context.activeSources.length, 0, 'Releasing all contacts should stop the gesture');
    assert.equal(context.connectedNodes.length, 1);
  } finally { audio.dispose(); }
});

test('per-kind cooldown preserves an immediate release while transient groups stay capped at three', async () => {
  const { audio, context } = audioFixture();
  try {
    await audio.setEnabled(true);
    audio.play('press');
    assert.equal(audio.diagnostics().transientVoices, 1);
    audio.play('press');
    assert.equal(audio.diagnostics().transientVoices, 1, 'Repeated presses at the same instant must be suppressed');
    audio.play('release');
    assert.equal(audio.diagnostics().transientVoices, 2, 'A tap must still get its release accent');
    assert.equal(context.activeSources.length, 2, 'Each accent uses one recording');
    context.advance(0.081); audio.play('press');
    assert.equal(audio.diagnostics().transientVoices, 3);
    const allocated = context.sources.length;
    context.advance(0.05);
    for (let i = 0; i < 100; i++) { audio.play('press', 1); audio.play('release', 1); }
    assert.equal(audio.diagnostics().transientVoices, 3);
    assert.equal(context.sources.length, allocated, 'Rapid input must not create silent extra source graphs');
    audio.update(moving);
    assert.equal(audio.diagnostics().gestureActive, true);
    assert.equal(context.activeSources.length, 4, 'One texture can coexist with three bounded accents');
    context.advance(1);
    assert.equal(audio.diagnostics().transientVoices, 0);
    assert.equal(context.activeSources.length, 1);
    assert.ok(context.sources.slice(0, allocated).every(source => source.ended && source.outputs.size === 0));
    audio.update(still); context.advance(0.1);
    assert.equal(context.connectedNodes.length, 1, 'Ended voices must leave only the master connected');
    audio.play('press');
    assert.equal(audio.diagnostics().transientVoices, 1, 'Expired accents must release their voice slots');
  } finally { audio.dispose(); context.advance(1); }
});

test('pop uses a recorded snap with fades, bounded gain, and no oscillators', async () => {
  const { audio, context } = audioFixture();
  try {
    await audio.setEnabled(true);
    audio.play('pop', 1);
    assert.equal(audio.diagnostics().transientVoices, 1);
    assert.equal(context.activeSources.length, 1);
    const source = context.activeSources[0];
    assert.equal(source.kind, 'buffer source');
    assert.ok(source.buffer);
    assert.equal(source.loop, false);
    assert.ok(source.stopAt > .1 && source.stopAt < .2);
    assert.equal((context.masterConnections[0] as FakeGain).gain.value, .48);
    const envelope = context.nodes.filter(node => node instanceof FakeGain).at(-1) as FakeGain;
    assert.equal(envelope.gain.values.at(-1), 0, 'Recording fades to silence');
    context.advance(.6);
    assert.equal(context.activeSources.length, 0);
    assert.equal(context.connectedNodes.length, 1);
  } finally { audio.dispose(); }
});

test('stop followed by pop waits for one fading slot instead of losing the sound or exceeding the cap', async () => {
  const { audio, context } = audioFixture();
  try {
    await audio.setEnabled(true);
    audio.play('press'); audio.play('release');
    context.advance(0.081); audio.play('press'); audio.update(moving);
    assert.equal(audio.diagnostics().transientVoices, 3);
    assert.equal(context.activeSources.length, 4);
    audio.stop(); audio.play('pop');
    const before = context.sources.length;
    assert.equal(audio.diagnostics().transientVoices, 3);
    context.advance(0.024);
    assert.equal(context.sources.length, before, 'Do not allocate a fourth transient during the fade');
    context.advance(0.002);
    assert.equal(context.sources.length, before + 1, 'The pending pop must take the newly freed slot');
    assert.equal(audio.diagnostics().transientVoices, 1);
    assert.equal(context.activeSources.length, 1);
    assert.equal(audio.diagnostics().gestureActive, false);
    context.advance(0.6);
    assert.equal(context.activeSources.length, 0);
    assert.equal(context.connectedNodes.length, 1);
  } finally { audio.dispose(); context.advance(1); }
});

test('a full-cap pop fades the oldest accent and its own cooldown survives stop calls', async () => {
  const { audio, context } = audioFixture();
  try {
    await audio.setEnabled(true);
    audio.play('press'); audio.play('release'); context.advance(0.081); audio.play('press');
    audio.play('pop');
    for (let i = 0; i < 100; i++) audio.play('pop');
    assert.equal(context.sources.length, 3);
    context.advance(0.026);
    assert.equal(audio.diagnostics().transientVoices, 3);
    assert.equal(context.activeSources.length, 3, 'Two accents and a pop stay within the cap');
    assert.ok(context.sources.slice(0, 1).every(source => source.ended && source.outputs.size === 0));
    assert.equal(context.sources.length, 4);
    context.advance(0.1); audio.stop(); audio.play('pop');
    assert.equal(context.sources.length, 4, 'Stopping must not bypass the pop cooldown');
    context.advance(0.225); audio.play('pop');
    assert.equal(context.sources.length, 5, 'A new pop is allowed after 0.35 seconds');
    assert.equal(audio.diagnostics().transientVoices, 1);
  } finally { audio.dispose(); context.advance(1); }
});

test('stop, mute, and disposal cancel a queued pop before a fading voice ends', async () => {
  for (const action of ['stop', 'mute', 'dispose'] as const) {
    const { audio, context } = audioFixture();
    try {
      await audio.setEnabled(true);
      audio.play('press'); audio.play('release'); context.advance(0.081); audio.play('press');
      audio.play('pop');
      if (action === 'stop') audio.stop();
      else if (action === 'mute') await audio.setEnabled(false);
      else audio.dispose();
      context.advance(1);
      assert.equal(context.sources.length, 3, `${action} must prevent the queued pop from allocating sources`);
      assert.equal(context.activeSources.length, 0);
      assert.equal(audio.diagnostics().transientVoices, 0);
      assert.equal(context.connectedNodes.length, action === 'dispose' ? 0 : 1);
    } finally { audio.dispose(); }
  }
});

test('stop and mute disconnect active sources and permit a clean later restart', async () => {
  const { audio, context } = audioFixture();
  try {
    await audio.setEnabled(true);
    audio.play('press'); audio.play('release'); audio.update(moving);
    assert.ok(context.activeSources.length > 2);
    audio.stop(); context.advance(0.2);
    assert.equal(context.activeSources.length, 0);
    assert.equal(context.connectedNodes.length, 1);
    assert.equal(audio.enabled, true, 'Stopping an interaction must preserve the sound preference');
    context.advance(1); audio.update(moving); audio.play('press');
    assert.ok(context.activeSources.length > 0);
    await audio.setEnabled(false);
    context.advance(0.2);
    assert.equal(audio.enabled, false);
    assert.equal(context.activeSources.length, 0);
    assert.equal(context.connectedNodes.length, 1);
    const sourceCount = context.sources.length;
    audio.update(moving); audio.play('release');
    assert.equal(context.sources.length, sourceCount);
    await audio.setEnabled(true); audio.update(moving);
    assert.equal(context.activeSources.length, 1);
  } finally { audio.dispose(); context.advance(1); }
  assert.equal(context.connectedNodes.length, 0);
  assert.equal(context.activeSources.length, 0);
  assert.equal(context.closeCalls, 1);
});

test('muting while context resume is pending cannot enable sound afterward', async () => {
  const { audio, context } = audioFixture();
  context.blockResume();
  const enabling = audio.setEnabled(true);
  await audio.setEnabled(false);
  context.resolveResume(); await enabling;
  assert.equal(audio.enabled, false);
  audio.update(moving); audio.play('press');
  assert.equal(context.sources.length, 0);
  audio.dispose();
});

test('disposing during pending resume closes once and cannot resurrect the audio graph', async () => {
  const { audio, context, contextsCreated } = audioFixture();
  context.blockResume();
  const enabling = audio.setEnabled(true);
  audio.dispose(); audio.dispose();
  context.resolveResume(); await enabling;
  await audio.setEnabled(true);
  audio.update(moving); audio.play('press');
  assert.equal(audio.enabled, false);
  assert.equal(contextsCreated(), 1);
  assert.equal(context.sources.length, 0);
  assert.equal(context.connectedNodes.length, 0);
  assert.equal(context.closeCalls, 1);
});

test('extreme and nonfinite interaction inputs produce finite bounded audio parameters', async () => {
  for (const pitch of [NaN, -Infinity, Infinity, -1e6, 1e6]) {
    const { audio, context } = audioFixture(pitch);
    try {
      await audio.setEnabled(true);
      for (const value of [-1e9, -Infinity, NaN, 0, 1, Infinity, 1e9]) {
        audio.play('press', value); audio.play('release', value); audio.play('pop', value);
        audio.update({ contacts: value, compression: value, stretch: value, motion: value, twist: value });
        context.advance(0.3);
      }
      for (const node of context.nodes) {
        if (node instanceof FakeGain) {
          assert.ok(node.gain.values.every(value => value >= 0 && value <= 1), `Unbounded gain: ${node.gain.values}`);
        } else if (node instanceof FakeFilter) {
          assert.ok(node.frequency.values.every(value => value > 0 && value <= 20_000));
          assert.ok(node.Q.values.every(value => value >= 0 && value <= 50));
        } else if (node instanceof FakeSource) {
          assert.ok(node.frequency.values.every(value => value > 0 && value <= 20_000));
          assert.ok(node.playbackRate.values.every(value => value > 0 && value <= 4));
        }
      }
      for (const buffer of context.buffers) for (const channel of buffer.data) {
        assert.ok(channel.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
      }
    } finally { audio.dispose(); context.advance(1); }
    assert.equal(context.activeSources.length, 0);
    assert.equal(context.connectedNodes.length, 0);
  }
});
