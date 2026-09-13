import { circleOutline, drawingOutline, PRESET_OUTLINES, type DrawStroke, type Outline } from './paths';

const STORAGE_KEY = 'astra-shape-studio-v1';
export const DEFAULT_FLOW_SPEED = .14;
export type StudioState = { preset: string; speed: number; strokes: DrawStroke[]; connectEnds: boolean; defaultVersion: number };
export function loadStudioState(persist = true): StudioState {
  const fallback: StudioState = {preset:'circle',speed:1,strokes:[],connectEnds:false,defaultVersion:2};
  if (!persist) return fallback;
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text || text.length > 300000) return fallback;
    const data = JSON.parse(text);
    const strokes: DrawStroke[] = Array.isArray(data.strokes) ? data.strokes.slice(0,16).filter(Array.isArray).map((stroke: unknown[]) => stroke.slice(0,1600).filter((p): p is [number,number] => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 100))) : [];
    const savedPreset = typeof data.preset === 'string' ? data.preset : 'circle';
    return {preset:data.defaultVersion === 2 ? savedPreset : savedPreset === 'cursor' ? 'circle' : savedPreset,speed:Number.isFinite(data.speed) ? Math.max(.25,Math.min(3,data.speed)) : 1,strokes,connectEnds:data.connectEnds === true,defaultVersion:2};
  } catch { return fallback; }
}
export function studioOutline(state: StudioState): Outline {
  if (state.preset === 'custom') { try { return drawingOutline(state.strokes,state.connectEnds); } catch { return circleOutline; } }
  return PRESET_OUTLINES.find(p => p.id === state.preset) ?? circleOutline;
}

function icon(outline: Outline) {
  return `<svg viewBox="-2.3 -2.3 4.6 4.6" fill="none" aria-hidden="true">${outline.paths.map(path => `<path d="${Array.from({length:72},(_,i)=>{const p=path.sample(i/71);return `${i?'L':'M'}${p.x.toFixed(3)},${(-p.y).toFixed(3)}`;}).join(' ')}${path.closed?'Z':''}" stroke="currentColor" stroke-width=".10" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
}

export function createOutlineStudio(wrapper: HTMLElement, state: StudioState, callbacks: {onOutline(outline: Outline): void; onSpeed(speed: number): void; onEditing(editing: boolean): void}, persist = true) {
  const events = new AbortController(), signal = events.signal;
  const bar = document.createElement('div'); bar.className = 'astra-shape-bar';
  const choose = document.createElement('button'); choose.type='button'; choose.className='astra-shape-choice'; choose.setAttribute('aria-expanded','false'); choose.setAttribute('aria-controls','astra-presets');
  const draw = document.createElement('button'); draw.type='button'; draw.className='astra-draw-button'; draw.innerHTML='<span aria-hidden="true">✎</span> Draw a shape';
  const presets = document.createElement('div'); presets.className='astra-presets'; presets.id='astra-presets'; presets.hidden=true; presets.setAttribute('role','group'); presets.setAttribute('aria-label','Choose a starlight shape');
  const presetHeading=document.createElement('div');presetHeading.className='astra-preset-heading';presetHeading.textContent='Choose an outline';presets.append(presetHeading);
  const presetButtons: HTMLButtonElement[]=[];
  for (const outline of PRESET_OUTLINES) {
    const button=document.createElement('button');button.type='button';button.innerHTML=`${icon(outline)}<span>${outline.name}</span>`;button.setAttribute('aria-label',`Use ${outline.name.toLowerCase()} shape`);
    button.addEventListener('click',()=>select(outline),{signal});presets.append(button);presetButtons.push(button);
  }
  const savedDrawing=document.createElement('button');savedDrawing.type='button';savedDrawing.className='astra-saved-drawing';savedDrawing.setAttribute('aria-label','Use your drawing shape');savedDrawing.hidden=true;
  savedDrawing.addEventListener('click',()=>{try{select(drawingOutline(state.strokes,state.connectEnds));}catch{/* Invalid saved drawings stay hidden. */}},{signal});presets.append(savedDrawing);
  bar.append(choose,draw,presets);
  const speedBox=document.createElement('div');speedBox.className='astra-speed';
  const speedLabel=document.createElement('label');speedLabel.htmlFor='astra-flow-speed';speedLabel.textContent='Flow speed';
  const speedOutput=document.createElement('output');speedOutput.htmlFor='astra-flow-speed';
  const speed=document.createElement('input');speed.id='astra-flow-speed';speed.type='range';speed.min='.25';speed.max='3';speed.step='.05';speed.value=String(state.speed);speed.setAttribute('aria-label','Flow speed');
  const restoreSpeed=document.createElement('button');restoreSpeed.type='button';restoreSpeed.className='astra-speed-reset';restoreSpeed.textContent='Reset speed';
  speedBox.append(speedLabel,speedOutput,speed,restoreSpeed);
  const overlay=document.createElement('div');overlay.className='astra-draw-overlay';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','astra-draw-title');
  overlay.innerHTML='<div class="astra-draw-heading"><span class="astra-eyebrow">MAKE IT YOURS</span><h2 id="astra-draw-title">Draw with starlight.</h2><p>Sketch a line, a loop, or a few separate strokes.</p></div>';
  const drawing=document.createElement('canvas');drawing.className='astra-drawing';drawing.tabIndex=0;drawing.setAttribute('aria-label','Draw a shape using a mouse, pen, or finger. Use presets for keyboard selection.');
  const drawingContext=drawing.getContext('2d')!;
  const hint=document.createElement('span');hint.className='astra-drawing-hint';hint.textContent='Start anywhere';
  const drawingFrame=document.createElement('div');drawingFrame.className='astra-drawing-frame';drawingFrame.append(drawing,hint);
  const toolbar=document.createElement('div');toolbar.className='astra-draw-toolbar';
  const undo=document.createElement('button');undo.type='button';undo.textContent='Undo';
  const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';
  const connectLabel=document.createElement('label');connectLabel.className='astra-connect-label';
  const connect=document.createElement('input');connect.type='checkbox';connect.checked=state.connectEnds;connectLabel.append(connect,document.createTextNode('Connect ends'));
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
  const animate=document.createElement('button');animate.type='button';animate.className='astra-animate-button';animate.textContent='Animate drawing';
  const message=document.createElement('p');message.className='astra-draw-message';message.setAttribute('role','status');
  toolbar.append(undo,clear,connectLabel,cancel,animate);overlay.append(drawingFrame,message,toolbar);wrapper.append(bar,speedBox,overlay);
  let draft: DrawStroke[]=[], history: DrawStroke[][]=[], pointer: number|null=null, currentStroke: DrawStroke|null=null;
  let width=1,height=1,pixelRatio=1;
  const save=()=>{if(!persist)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{/* The active drawing still works when local storage is unavailable. */}};
  const hidePresets=()=>{presets.hidden=true;choose.setAttribute('aria-expanded','false');};
  function updateSelection() {
    const selected=studioOutline(state);choose.innerHTML=`${icon(selected)}<span>${selected.name}</span><span aria-hidden="true">⌄</span>`;choose.setAttribute('aria-label',`Choose shape, current ${selected.name}`);
    presetButtons.forEach((button,i)=>button.setAttribute('aria-pressed',String(PRESET_OUTLINES[i].id===selected.id)));
    try {const custom=drawingOutline(state.strokes,state.connectEnds);savedDrawing.hidden=false;savedDrawing.innerHTML=`${icon(custom)}<span>Your drawing</span>`;savedDrawing.setAttribute('aria-pressed',String(selected.id==='custom'));}catch{savedDrawing.hidden=true;}
  }
  function select(outline: Outline) {state.preset=outline.id;save();updateSelection();hidePresets();callbacks.onOutline(outline);choose.focus();}
  function updateSpeed() {speedOutput.value=`${state.speed.toFixed(2)}×`;speed.setAttribute('aria-valuetext',`${state.speed.toFixed(2)} times speed`);}
  speed.addEventListener('input',()=>{state.speed=Number(speed.value);updateSpeed();callbacks.onSpeed(state.speed);save();},{signal});
  restoreSpeed.addEventListener('click',()=>{speed.value='1';state.speed=1;updateSpeed();callbacks.onSpeed(1);save();},{signal});
  choose.addEventListener('click',()=>{presets.hidden=!presets.hidden;choose.setAttribute('aria-expanded',String(!presets.hidden));},{signal});
  wrapper.addEventListener('pointerdown',event=>{if(!bar.contains(event.target as Node))hidePresets();},{signal});
  const snapshot=()=>{history.push(draft.map(stroke=>stroke.slice()));if(history.length>40)history.shift();};
  function paint() {
    drawingContext.setTransform(pixelRatio,0,0,pixelRatio,0,0);drawingContext.clearRect(0,0,width,height);
    const scale=Math.min(width-32,height-32)/4.5;
    const gradient=drawingContext.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#f3f8ff');gradient.addColorStop(1,'#82caff');
    drawingContext.strokeStyle=gradient;drawingContext.lineWidth=2;drawingContext.lineCap='round';drawingContext.lineJoin='round';drawingContext.shadowColor='#93cfff';drawingContext.shadowBlur=8;
    for(const stroke of draft) {
      drawingContext.beginPath();stroke.forEach(([x,y],i)=>{const px=width/2+x*scale,py=height/2-y*scale;if(i)drawingContext.lineTo(px,py);else drawingContext.moveTo(px,py);});
      if(connect.checked&&stroke.length>2)drawingContext.closePath();drawingContext.stroke();
    }
    hint.hidden=draft.length>0;undo.disabled=!history.length;clear.disabled=!draft.length;animate.disabled=!draft.some(stroke=>stroke.length>=2);
  }
  function resize() {const rect=drawing.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;pixelRatio=Math.min(2,devicePixelRatio||1);drawing.width=Math.round(width*pixelRatio);drawing.height=Math.round(height*pixelRatio);paint();}
  const observer=new ResizeObserver(resize);observer.observe(drawing);
  function endPointer() {if(pointer!==null){try{drawing.releasePointerCapture(pointer);}catch{/* Already released. */}}pointer=null;currentStroke=null;paint();}
  function closeDrawing() {endPointer();overlay.hidden=true;wrapper.classList.remove('is-drawing');callbacks.onEditing(false);draw.focus();}
  draw.addEventListener('click',()=>{hidePresets();draft=state.strokes.map(stroke=>stroke.slice());history=draft.map((_,i)=>draft.slice(0,i).map(stroke=>stroke.slice()));connect.checked=state.connectEnds;message.textContent='';overlay.hidden=false;wrapper.classList.add('is-drawing');callbacks.onEditing(true);resize();drawing.focus();},{signal});
  cancel.addEventListener('click',closeDrawing,{signal});
  undo.addEventListener('click',()=>{endPointer();draft=history.pop()??[];message.textContent='';paint();},{signal});
  clear.addEventListener('click',()=>{endPointer();snapshot();draft=[];message.textContent='';paint();},{signal});
  connect.addEventListener('change',paint,{signal});
  animate.addEventListener('click',()=>{
    endPointer();
    try {const outline=drawingOutline(draft,connect.checked);state.strokes=draft.map(stroke=>stroke.slice());state.connectEnds=connect.checked;state.preset='custom';save();updateSelection();callbacks.onOutline(outline);closeDrawing();}
    catch(error){message.textContent=error instanceof Error?error.message:'Try drawing a larger shape.';}
  },{signal});
  function point(event: PointerEvent): readonly [number,number] {const rect=drawing.getBoundingClientRect(),scale=Math.max(1,Math.min(width-32,height-32)/4.5);return [(Math.max(0,Math.min(width,event.clientX-rect.left))-width/2)/scale,(height/2-Math.max(0,Math.min(height,event.clientY-rect.top)))/scale];}
  function move(event: PointerEvent) {
    if(event.pointerId!==pointer||!currentStroke)return;
    const p=point(event),last=currentStroke[currentStroke.length-1];
    if(currentStroke.length<1600&&Math.hypot(p[0]-last[0],p[1]-last[1])>.012){currentStroke.push(p);paint();}
  }
  drawing.addEventListener('pointerdown',event=>{
    if(pointer!==null||event.button!==0||!event.isPrimary)return;event.preventDefault();
    if(draft.length>=16){message.textContent='Up to 16 strokes per drawing. Undo one to make room.';return;}
    try{drawing.setPointerCapture(event.pointerId);}catch{return;}
    snapshot();pointer=event.pointerId;currentStroke=[point(event)];draft.push(currentStroke);message.textContent='';paint();
  },{signal});
  drawing.addEventListener('pointermove',move,{signal});
  drawing.addEventListener('pointerup',event=>{if(event.pointerId===pointer){move(event);endPointer();}},{signal});
  for(const name of ['pointercancel','lostpointercapture'])drawing.addEventListener(name,event=>{if((event as PointerEvent).pointerId===pointer)endPointer();},{signal});
  wrapper.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(!overlay.hidden){event.preventDefault();closeDrawing();}else{hidePresets();choose.focus();}}
    if(!overlay.hidden&&event.key==='Tab'){
      const elements=Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled),input,canvas'));
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },{signal});
  updateSelection();updateSpeed();
  return {dispose(){events.abort();observer.disconnect();bar.remove();speedBox.remove();overlay.remove();}};
}
