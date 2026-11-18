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
S['tap']=mix(tone(2400,0.045,dec=0.008,a=0.0008),0.4*bp(noise(0.02),2000,7000)*env(int(0.02*SR),0.0005,dec=0.003))
S['confirm']=cat(tone(880,0.07,dec=0.04,h=(1,2)),tone(1320,0.12,dec=0.06,h=(1,2)),gap=0.01)
S['toggle']=cat(tone(1500,0.03,dec=0.008,a=0.0008),tone(2100,0.04,dec=0.01,a=0.0008),gap=0.025)
w=bp(noise(0.36),300,4000); t=T(0.36); sweep=np.sin(np.pi*t/0.36)**2
S['whoosh']=lfilter(*butter(2,0.25),w)*sweep*1.0+0.3*bp(noise(0.36),1500,6000)*sweep**3
# power-on: rising synth + servo + sparkle
d=1.5; t=T(d); f=lambda t:110*2**(3*(t/d)**1.6)
syn=tone(f,d,h=(1,2,3,4))*np.minimum(1,t/0.3)
servo=bp(noise(d),600,1800)*(0.5+0.5*np.sign(np.sin(2*np.pi*38*t)))*np.exp(-((t-0.55)/0.35)**2)
pw=mix(syn*0.9*np.minimum(1,(d-t)/0.08+0.0)*1.0, servo*0.5, place(bell(1760,0.6,0.2),1.25,int(1.9*SR))*0.5, place(bell(2637,0.5,0.15),1.33,int(1.9*SR))*0.35)
S['power_on']=pw
def chirp(fs,dur=0.07,g=0.012):
    return cat(*[tone((lambda a,b: (lambda t: a+(b-a)*t/dur))(a,b),dur,h=(1,3),dec=0.08) for a,b in fs],gap=g)
S['robot_talk']=chirp([(900,1400),(1400,700),(1100,1600),(1600,1200)],0.065)
S['robot_think']=chirp([(500,620),(620,500),(560,760)],0.11,0.03)*(0.8)
S['granted']=mix(*[place(bell(f,0.7,0.3),i*0.08,int(1.0*SR)) for i,f in enumerate([523.25,659.25,783.99,1046.5])])
t=T(0.32); S['error']=np.tanh(4*np.sin(2*np.pi*150*t))*0.6*(0.6+0.4*np.sin(2*np.pi*22*t))*env(len(t),0.005,dec=0.25)
S['error']=lfilter(*butter(2,0.15),S['error'])
fan=[place(tone(f,0.16,dec=0.2,h=(1,2,3)),i*0.11,int(1.6*SR)) for i,f in enumerate([523.25,659.25,783.99])]
fan.append(place(mix(tone(1046.5,0.8,dec=0.35,h=(1,2,3)),tone(1318.5,0.8,dec=0.35,h=(1,2)),tone(1568,0.8,dec=0.35)),0.36,int(1.6*SR)))
for i in range(10): fan.append(place(bell(2000+rng.random()*3000,0.25,0.06)*0.25,0.45+i*0.08,int(1.6*SR)))
S['celebrate']=mix(*fan)
S['sent']=tone(lambda t:900+1400*t/0.09,0.09,dec=0.05,h=(1,2))
S['received']=cat(tone(1500,0.06,dec=0.03,h=(1,2)),tone(1000,0.08,dec=0.04,h=(1,2)),gap=0.015)
S['tool_tick']=tone(3200,0.03,dec=0.005,a=0.0005)*0.8
targets={'tap':-24,'toggle':-22,'tool_tick':-26,'whoosh':-22}
m=pyln.Meter(SR,block_size=0.03)
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
