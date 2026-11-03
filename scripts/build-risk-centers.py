"""Generate display-only interior representative points from pinned upstream polygons."""
import json,pathlib,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
assets=json.loads((root/'src/data/riskMapAssets.json').read_text())
def inside(point,rings):
 def ring(poly):
  x,y=point;hit=False
  for a,b in zip(poly,poly[1:]):
   if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
  return hit
 return ring(rings[0]) and not any(ring(hole) for hole in rings[1:])
def area(poly):return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:])))
def center(rings):
 outer=rings[0];cross=[a[0]*b[1]-b[0]*a[1] for a,b in zip(outer,outer[1:])];den=3*sum(cross)
 if den:
  p=tuple(sum((a[i]+b[i])*c for a,b,c in zip(outer,outer[1:],cross))/den for i in [0,1])
  if inside(p,rings):return p
 ys=sorted(set(p[1] for ring in rings for p in ring));best=None
 for low,high in zip(ys,ys[1:]):
  y=(low+high)/2;xs=[]
  for ring in rings:
   for a,b in zip(ring,ring[1:]):
    if (a[1]>y)!=(b[1]>y):xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  xs.sort()
  for left,right in zip(xs,xs[1:]):
   p=((left+right)/2,y)
   if inside(p,rings) and (best is None or right-left>best[0]):best=(right-left,p)
 return best[1] if best else None
regions={}
for asset in assets:
 data=(root/'public'/asset['localPath']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==asset['sha256'], 'Pinned source checksum mismatch'
 for feature in json.loads(data)['features']:
  entry=asset['mapping'][feature['properties'][asset['idProperty']]];code=entry['code']
  if not code:continue
  geom=feature['geometry'];polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates'];polygon=max(polys,key=lambda p:area(p[0]));point=center(polygon)
  if point:
   rounded=tuple(float(f'{v:.6f}') for v in point)
   if inside(rounded,polygon) and -180<=rounded[0]<=180 and -90<=rounded[1]<=90:regions[code]={'longitude':f'{rounded[0]:.6f}','latitude':f'{rounded[1]:.6f}'}
result={'schemaVersion':1,'source':{'chinaCommit':assets[0]['commit'],'worldCommit':assets[1]['commit'],'method':'Display approximation only: largest planar Polygon; interior area centroid, otherwise midpoint of longest interior horizontal scan interval between vertex latitudes; holes excluded; rounded point revalidated.'},'regions':dict(sorted(regions.items()))}
data=(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode();(root/'src/data/risk-region-centers.json').write_bytes(data);(root.parent/'docs/risk-region-centers.json').write_bytes(data);print(len(regions),hashlib.sha256(data).hexdigest())
