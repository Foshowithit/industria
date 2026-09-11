from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",headless=False,
      args=["--use-gl=angle","--use-angle=gl","--enable-gpu","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={"width":1440,"height":900})
    pg.goto("http://127.0.0.1:8799/index.html",wait_until="load"); pg.wait_for_timeout(2000)
    pg.click("#gate"); pg.wait_for_timeout(900)
    r=pg.evaluate("""() => {
      const I=window.INDUSTRIA, S=I.scene, T=I.THREE;
      const lights=[]; S.traverse(o=>{ if(o.isLight) lights.push({
        type:o.type, i:+o.intensity.toFixed(2), d:o.distance,
        pos:[+o.position.x.toFixed(1),+o.position.y.toFixed(1),+o.position.z.toFixed(1)],
        vis:o.visible }); });
      const cellKids=[]; I.cell.children.forEach(o=>{
        const p=new T.Vector3(); o.getWorldPosition(p);
        cellKids.push({ t:o.type, mat:o.material&&o.material.color?'#'+o.material.color.getHexString():'-',
          op:o.material?o.material.opacity:null, tr:o.material?o.material.transparent:null,
          wp:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)], vis:o.visible,
          geo:o.geometry&&o.geometry.type }); });
      const cellBox=new T.Box3().setFromObject(I.cell);
      return { lightCount:lights.length, lights:lights.slice(0,14), cellKids, 
               cellBox:{min:cellBox.min.toArray().map(v=>+v.toFixed(2)),
                        max:cellBox.max.toArray().map(v=>+v.toFixed(2))},
               exposure:I.renderer.toneMappingExposure, tone:I.renderer.toneMapping,
               shadows:I.renderer.shadowMap.enabled };
    }""")
    print(json.dumps(r,indent=1)[:3200])
    b.close()
