import numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
src=np.asarray(Image.open('/workspace/projects/63d46980-7164-4457-910d-060f812d1fca/files/uploads/25883-47092c8729a3.png').convert('RGB'))
m=np.asarray(Image.open('cmask_isnet-general-use.png')).astype(np.float32)/255
b=(m>0.18).astype(np.uint8)
k=lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1))
b=cv2.morphologyEx(b,cv2.MORPH_CLOSE,k(6))
b=nd.binary_fill_holes(b).astype(np.uint8)
o=cv2.morphologyEx(b,cv2.MORPH_OPEN,k(9))
lab,n=nd.label(o); sz=nd.sum(o,lab,range(1,n+1)); o=(lab==(np.argmax(sz)+1)).astype(np.uint8)
o=nd.binary_fill_holes(o).astype(np.uint8)
np.save('sil.npy',o)
Image.fromarray(o*255).resize((627,627)).save('sil_small.png')
