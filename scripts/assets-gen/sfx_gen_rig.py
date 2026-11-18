# v1.4: extra robot sounds (servo whir for big moves, chirp when tapped). Run from res/raw.
import numpy as np, scipy.io.wavfile as wf, subprocess, pyloudnorm as pyln
from scipy.signal import butter, lfilter
SR=32000; rng=np.random.default_rng(7)
def T(d): return np.arange(int(d*SR))/SR
def env(n,a=0.003,r=None,dec=None):
    t=np.arange(n)/SR; e=np.minimum(1,t/max(a,1e-4))
    if dec: e*=np.exp(-t/dec)
    return e
def tone(f,d,dec=None,a=0.003,h=(1,),wave='sin'):
    t=T(d); 
    if callable(f): ph=2*np.pi*np.cumsum(f(t))/SR
    else: ph=2*np.pi*f*t
    s=sum(np.sin(ph*k)/k**1.3 for k in h) if wave=='sin' else np.tanh(3*np.sin(ph))
    e=env(len(t),a,dec=dec); r=min(int(0.004*SR),len(t)//2); e[-r:]*=np.linspace(1,0,r)
    return s*e
def bell(f,d,dec=0.25): return tone(f,d,dec,h=(1,))+0.35*tone(f*2.76,d,dec*0.4)+0.2*tone(f*5.4,d,dec*0.2)
def noise(d): return rng.standard_normal(int(d*SR))
def bp(x,lo,hi): b,a=butter(2,[lo/(SR/2),hi/(SR/2)],'band'); return lfilter(b,a,x)
def cat(*xs,gap=0.0):
    out=[]
    for x in xs: out+= [x,np.zeros(int(gap*SR))]
    return np.concatenate(out)
def mix(*xs):
    n=max(len(x) for x in xs); o=np.zeros(n)
    for x in xs: o[:len(x)]+=x
    return o
def place(x,t0,n):
    o=np.zeros(n); i=int(t0*SR); o[i:i+len(x)]=x[:n-i]; return o
S={}
# servo whir: short motor buzz with pitch glide up then down (big arm moves)
d=0.42; t=T(d); f=lambda t: 180+260*np.sin(np.pi*t/d)
mot=tone(f,d,h=(1,2,3,4,5))*0.5
grit=bp(noise(d),900,3200)*(0.55+0.45*np.sign(np.sin(2*np.pi*46*t)))*0.35
S['servo']=(mot+grit)*np.sin(np.pi*t/d)**0.6
# playful chirp (robot tapped): quick up-down-up whistle
def gl(a,b,du): return tone(lambda t: a+(b-a)*(t/du)**0.7,du,h=(1,2),dec=0.12)
S['chirp']=cat(gl(1200,2300,0.07),gl(2100,1500,0.06),gl(1600,2800,0.09),gap=0.012)
targets={'servo':-24,'chirp':-19}
targets.update({});m=pyln.Meter(SR,block_size=0.03)
import os
tot=0
for k,x in S.items():
    x=x.astype(np.float64); n=len(x)
    fi=int(0.002*SR); x[:fi]*=np.linspace(0,1,fi); fo=min(int(0.02*SR),n//3); x[-fo:]*=np.linspace(1,0,fo)
    x=np.concatenate([x,np.zeros(int(0.03*SR))])
    L=m.integrated_loudness(x); tgt=targets.get(k,-18)
    x=x*10**((tgt-L)/20); pk=np.abs(x).max()
    if pk>0.89: x=0.89*np.tanh(x/0.89)
    wf.write(f'{k}.wav',SR,(x*32767).astype(np.int16))
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',f'{k}.wav','-c:a','libvorbis','-q:a','2',f'sfx_{k}.ogg'],check=True)
    sz=os.path.getsize(f'sfx_{k}.ogg'); tot+=sz
    print(f'{k:12s} dur={n/SR:.2f}s L={L:6.1f}->{tgt} peak={np.abs(x).max():.2f} {sz}B')
print('total',tot)
