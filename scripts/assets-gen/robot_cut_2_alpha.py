import numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as nd
S=1254
src=np.asarray(Image.open('/workspace/projects/63d46980-7164-4457-910d-060f812d1fca/files/uploads/25883-47092c8729a3.png').convert('RGB')).astype(np.float32)
o=np.load('sil.npy')
keep=Image.new('L',(S,S),0)
ImageDraw.Draw(keep).polygon([(150,215),(330,150),(1254,150),(1254,1254),(0,1254),(0,720),(285,720),(318,560),(268,470),(236,340),(170,235)],fill=1)
o=o*np.asarray(keep)
k=lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1))
o=cv2.morphologyEx(o.astype(np.uint8),cv2.MORPH_OPEN,k(3))
lab,n=nd.label(o); sz=nd.sum(o,lab,range(1,n+1)); o=(lab==(np.argmax(sz)+1)).astype(np.uint8)
o=cv2.erode(o,k(2))
a=cv2.GaussianBlur(o.astype(np.float32),(0,0),1.3)
isn=np.asarray(Image.open('cmask_isnet-general-use.png')).astype(np.float32)/255
band=1-cv2.erode(o,k(7)).astype(np.float32)
a=a*(1-band+band*np.clip(isn*1.5,0,1))
# fades: bottom (hologram bust), left frame edge
yy,xx=np.mgrid[0:S,0:S].astype(np.float32)
fb=np.clip((1195-yy)/260,0,1)**1.2
fl=np.clip((xx-28)/50,0,1)
a=a*fb*fl
np.save('alpha.npy',a)
rgba=np.dstack([src,a*255]).clip(0,255).astype(np.uint8)
Image.fromarray(rgba,'RGBA').save('robot_full.png')
for name,bgc in [('black',(0,0,0)),('mag',(200,0,160))]:
  bg=np.ones_like(src)*np.array(bgc,np.float32)
  comp=src*a[...,None]+bg*(1-a[...,None])
  Image.fromarray(comp.astype(np.uint8)).resize((627,627)).save(f'on_{name}.png')
