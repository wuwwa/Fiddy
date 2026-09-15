"""Build material-specific CC0 foley (Python 3 + ffmpeg). Run from any directory."""
import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import urllib.request
import wave
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio/asmr'
CACHE = ROOT / '.local/asmr-sources'
RATE = 32000
# Each material owns its cuts; there is no shared slime/pop fallback.
# Tuple: press A, press B, release A, release B, motion. Cuts are start/duration.
MATERIALS = {
    'gel': [('impactSoft_medium_000', 0, .115), ('impactSoft_medium_001', 0, .18), ('impactSoft_medium_002', .02, .11), ('impactSoft_medium_003', .01, .13), ('clothBelt', .02, .58)],
    'foam': [('footstep_carpet_000', 0, .16), ('footstep_carpet_001', 0, .18), ('cloth3', .01, .24), ('cloth4', .01, .24), ('cloth3', .015, .36)],
    'rubber': [('creak1', .10, .18), ('creak2', .01, .18), ('beltHandle1', .05, .18), ('beltHandle2', .17, .20), ('creak1', .06, .48)],
    'star': [('impactSoft_medium_004', 0, .17), ('impactSoft_heavy_003', .015, .18), ('cloth2', .12, .18), ('cloth1', .27, .20), ('cloth4', .01, .28)],
    'dumpling': [('dropLeather', .015, .24), ('impactSoft_heavy_000', .02, .22), ('clothBelt2', .09, .22), ('clothBelt2', .30, .20), ('clothBelt2', .01, .46)],
    'putty': [('handleSmallLeather', .03, .20), ('handleSmallLeather2', .03, .20), ('beltHandle1', .08, .15), ('beltHandle2', .2, .16), ('beltHandle2', .04, .34)],
    'dough': [('dough', .35, .26), ('dough', 1.04, .26), ('dough', 1.66, .3), ('dough', 2.30, .3), ('dough', .3, 2.3)],
    'cloth': [('cloth', .52, .26), ('cloth', 1.22, .24), ('cloth', 1.42, .28), ('cloth', 1.64, .23), ('cloth', .96, .9)],
    'slice': [('drawKnife1', .055, .19), ('drawKnife2', .035, .20), ('knifeSlice', .03, .30), ('knifeSlice2', .02, .32), ('knifeSlice', .06, .28)],
}
CUTOFF = {'gel':1800,'foam':1800,'rubber':2900,'star':3200,'dumpling':1700,'putty':2400,'dough':3000,'cloth':4400,'slice':3400}


def main():
    manifest = json.loads((OUT / 'sources.json').read_text())
    CACHE.mkdir(parents=True, exist_ok=True)
    needed = {cut[0] for cuts in MATERIALS.values() for cut in cuts}
    sources = {s['key']: s for s in manifest['sources'] if s['key'] in needed}
    assert needed == set(sources)
    for source in sources.values():
        path = CACHE / (source['key'] + '.' + source.get('format', 'mp3'))
        if not path.exists():
            if 'archive' in source:
                archive = CACHE / source['archive']
                if not archive.exists(): urllib.request.urlretrieve(source['download'], archive)
                with zipfile.ZipFile(archive) as z: path.write_bytes(z.read(source['archiveEntry']))
            else: urllib.request.urlretrieve(source['download'], path)
    clips = []
    for material, cuts in MATERIALS.items():
        for role, (key, start, duration) in zip(['press-a','press-b','release-a','release-b','motion'], cuts):
            source = sources[key]; path = CACHE / (key + '.' + source.get('format', 'mp3'))
            loop = role == 'motion'
            filters = f'highpass=f=90,lowpass=f={CUTOFF[material]},afftdn=nr=5:nf=-50'
            if loop: filters += ',atempo=0.65,acompressor=threshold=0.025:ratio=2:attack=6:release=90'
            raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ss',str(start),'-t',str(duration),'-ac','1','-ar',str(RATE),'-f','f32le','-'])
            raw = subprocess.check_output(['ffmpeg','-v','error','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-af',filters,'-f','f32le','-'],input=raw)
            data = list(array.array('f',raw)); assert len(data) > RATE*.06, (material,role)
            if loop:
                overlap = min(round(.06*RATE),len(data)//5)
                seam = [data[-overlap+i]*math.cos(i/(overlap-1)*math.pi/2)+data[i]*math.sin(i/(overlap-1)*math.pi/2) for i in range(overlap)]
                data = data[overlap:-overlap]+seam
            else:
                attack,tail = round(.006*RATE),min(round(.055*RATE),len(data)//3)
                for i in range(attack):data[i] *= i/attack
                for i in range(tail):data[-1-i] *= i/tail
            rms=math.sqrt(sum(x*x for x in data)/len(data));peak=max(abs(x) for x in data)
            gain=min(.055/max(rms,1e-6),.5/max(peak,1e-6))
            pcm=array.array('h',(round(x*gain*32767) for x in data))
            name=f'v2-{material}-{role}.wav';output=OUT/name
            with wave.open(str(output),'wb') as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(pcm.tobytes())
            clips.append(dict(file=name,source=key,start=start,duration=duration,loop=loop,outputDuration=len(data)/RATE,gain=round(gain,5),lowpass=CUTOFF[material],sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
    # Remove only previously manifested outputs within this exact asset folder.
    retained={c['file'] for c in clips}
    for old in manifest.get('clips',[]):
        target=(OUT/old['file']).resolve()
        assert target.parent == OUT.resolve()
        if old['file'] not in retained and target.is_file():target.unlink()
    manifest=dict(sources=list(sources.values()),processing='v2: mono 32 kHz PCM16; 90 Hz high-pass, material-specific low-pass, light denoise; 6/55 ms maximum accent fades; motion tempo .65, gentle 2:1 compression and <=60 ms loop seam; RMS .055, peak ceiling .50. Dry foley analogues; no slime recordings.',clips=clips)
    (OUT/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'{len(clips)} material clips, {sum((OUT/c["file"]).stat().st_size for c in clips):,} bytes')


if __name__ == '__main__': main()
