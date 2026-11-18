import numpy as np, scipy.io.wavfile as wf, subprocess
subprocess.run('ffmpeg -y -loglevel error -i raw.wav -af "rubberband=pitch=0.95:formant=preserved" -ar 32000 -ac 1 p.wav',shell=True,check=True)
sr,x=wf.read('p.wav'); x=x.astype(np.float32)/32768
t=np.arange(len(x))/sr
ring=x*np.sin(2*np.pi*42*t)
y=0.80*x+0.30*ring
# metallic comb (short delays)
for d,g in [(0.0045,0.28),(0.0071,0.18)]:
    n=int(d*sr); z=np.zeros_like(y); z[n:]=y[:-n]*g; y=y+z
# light reverb: few taps
out=np.concatenate([y,np.zeros(int(0.5*sr),np.float32)])
for d,g in [(0.061,0.22),(0.113,0.14),(0.173,0.09),(0.241,0.05)]:
    n=int(d*sr); out[n:n+len(y)]+=y*g
# power-up blip before
pre=int(0.25*sr); tt=np.arange(pre)/sr
f=300+1600*(tt/tt[-1])**2; ph=2*np.pi*np.cumsum(f)/sr
blip=0.18*np.sin(ph)*np.minimum(1,tt/0.01)*np.exp(-((tt-0.2)/0.08)**2*0.5)
out=np.concatenate([blip,out])
# fades
fi=int(0.005*sr); out[:fi]*=np.linspace(0,1,fi); fo=int(0.15*sr); out[-fo:]*=np.linspace(1,0,fo)
import pyloudnorm as pyln
L=pyln.Meter(sr).integrated_loudness(out); out=out*10**((-16-L)/20)
pk=np.abs(out).max(); print('lufs',L,'peak',pk)
out=0.95*np.tanh(out)
print('final',np.abs(out).max(),pyln.Meter(sr).integrated_loudness(out))
wf.write('welcome.wav',sr,(out*32767).astype(np.int16))
