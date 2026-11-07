"""Local scoring page for the gold set. Every click saves straight into gold_labels.csv.

    python -m ml.pipeline.gold_labeler            # then open http://localhost:8765
    python -m ml.pipeline.gold_labeler --handcheck   # score data/processed/handcheck_v6.csv instead

Keys: 1-5 set intensity then exposure, arrow keys / J K move between events.
Shows no model scores (blind labelling). Binds to 127.0.0.1 only.
"""
from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pandas as pd

from ml.pipeline.gold_set import GOLD_CSV, RUBRIC
from ml.pipeline.silver_labels import PROCESSED

PORT = int(os.environ.get("PORT", 8765))
FIELDS = {"my_intensity", "my_exposure", "notes"}
LOCK = threading.Lock()

# --handcheck: same page on the hand-check file; page field -> file column. Hides llm_* columns.
HANDCHECK = "--handcheck" in sys.argv
CSV_PATH = PROCESSED / "handcheck_v6.csv" if HANDCHECK else GOLD_CSV
COLMAP = ({"gold_id": "id", "description": "text", "my_intensity": "vlad_intensity",
           "my_exposure": "vlad_exposure", "notes": "vlad_notes"} if HANDCHECK else {})
HIDDEN = "llm_" if HANDCHECK else "claude_"
if HANDCHECK:
    RUBRIC += ("\nKilling rule (v6): one death and nothing else serious = 3; two or more deaths "
               "(incl. disasters) or an unstated plural = 4+; mass killings, thousands dead, famine = 5.\n")


def read() -> pd.DataFrame:
    return pd.read_csv(CSV_PATH, dtype=str, keep_default_na=False, encoding="utf-8-sig")


def save(gold_id: str, field: str, value: str) -> None:
    with LOCK:
        df = read()
        df.loc[df[COLMAP.get("gold_id", "gold_id")] == gold_id, COLMAP.get(field, field)] = value
        tmp = CSV_PATH.with_suffix(".tmp")
        df.to_csv(tmp, index=False, encoding="utf-8-sig")
        os.replace(tmp, CSV_PATH)


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>Gold Set Scoring</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--mute:#6b6b66;--card:#fff;--line:#dedcd6;--acc:#2f6fdb;--ok:#2e8b57}
@media (prefers-color-scheme:dark){:root{--bg:#191917;--fg:#ecebe6;--mute:#9a988f;--card:#23231f;--line:#3a3934;--acc:#6ea0ff;--ok:#5cc28a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:16px;display:grid;grid-template-columns:1fr 300px;gap:16px}
@media (max-width:800px){.wrap{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
h1{font-size:18px;margin:0 0 4px}.meta{color:var(--mute);font-size:13px}.desc{white-space:pre-wrap;margin:14px 0;font-size:15.5px}
.row{display:flex;align-items:center;gap:8px;margin:10px 0}.row b{width:80px}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;padding:6px 14px;cursor:pointer}
button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
textarea{width:100%;min-height:60px;font:inherit;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px}
.nav{display:flex;justify-content:space-between;margin-top:12px}.grid{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.grid span{width:38px;text-align:center;font-size:12px;border:1px solid var(--line);border-radius:6px;cursor:pointer;padding:2px 0}
.grid span.done{background:var(--ok);color:#fff;border-color:var(--ok)}.grid span.cur{outline:2px solid var(--acc)}
.rub{font-size:13px;color:var(--mute);white-space:pre-wrap}.saved{color:var(--ok);font-size:12px;min-height:18px}
</style></head><body><div class="wrap"><div class="card" id="ev"></div>
<div><div class="card"><b id="prog"></b><div class="grid" id="grid"></div></div>
<div class="card" style="margin-top:16px"><div class="rub" id="rub"></div></div></div></div>
<script>
const RUBRIC=__RUBRIC__;let rows=[],i=0;
const $=id=>document.getElementById(id);
async function load(){rows=await (await fetch('/api/rows')).json();const k=rows.findIndex(r=>!r.my_intensity||!r.my_exposure);i=k<0?0:k;render()}
async function put(f,v){const r=rows[i];r[f]=v;$('saved').textContent='saving…';
 const res=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gold_id:r.gold_id,field:f,value:v})});
 $('saved').textContent=res.ok?'saved to __FILE__':'SAVE FAILED';grid()}
function btns(f){return [1,2,3,4,5].map(n=>`<button class="${rows[i][f]==n?'on':''}" onclick="setv('${f}','${n}')">${n}</button>`).join('')}
function setv(f,v){put(f,v);render()}
function render(){const r=rows[i];$('ev').innerHTML=`<h1>${r.gold_id} · ${r.country} · ${r.date}</h1>
<div class="meta">${r.subindicator}<br>country_wide=${r.country_wide} · adm1: ${r.adm1_name||'–'} · groups: ${r.targeting_specific_population_groups||'–'} · source: ${r.source_name}</div>
<div class="desc"></div>
<div class="row"><b>Intensity</b>${btns('my_intensity')}</div><div class="row"><b>Exposure</b>${btns('my_exposure')}</div>
<textarea id="notes" placeholder="notes (optional)"></textarea><div class="saved" id="saved"></div>
<div class="nav"><button onclick="go(-1)">← prev</button><button onclick="go(1)">next →</button></div>`;
 document.querySelector('.desc').textContent=r.description;const n=$('notes');n.value=r.notes||'';
 n.onchange=()=>put('notes',n.value);grid()}
function grid(){const d=rows.filter(r=>r.my_intensity&&r.my_exposure).length;$('prog').textContent=`${d} / ${rows.length} scored`;
 $('grid').innerHTML=rows.map((r,k)=>`<span class="${r.my_intensity&&r.my_exposure?'done':''} ${k==i?'cur':''}" onclick="i=${k};render()">${r.gold_id}</span>`).join('')}
function go(d){const n=$('notes');if(n&&n.value!==(rows[i].notes||''))put('notes',n.value);i=Math.max(0,Math.min(rows.length-1,i+d));render()}
document.addEventListener('keydown',e=>{if(e.target.tagName=='TEXTAREA')return;
 if('12345'.includes(e.key)&&e.key.length==1){const r=rows[i];if(!r.my_intensity||r.my_exposure)setv('my_intensity',e.key);else setv('my_exposure',e.key)}
 if(e.key=='ArrowRight'||e.key=='j')go(1);if(e.key=='ArrowLeft'||e.key=='k')go(-1)});
$('rub').textContent=RUBRIC+'\nKeys: 1-5 = intensity, then exposure. ←/→ move.';load();
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/rows":
            df = read()
            if "review" in df and (df["review"] == "1").any():  # review mode: only the flagged events
                df = df[df["review"] == "1"]
            df = df[[c for c in df.columns if not c.startswith(HIDDEN)]]  # stay blind
            df = df.rename(columns={v: k for k, v in COLMAP.items()})
            for c in ("date", "adm1_name", "targeting_specific_population_groups", "source_name"):
                if c not in df:
                    df[c] = ""
            self._send(200, df.to_json(orient="records").encode(), "application/json")
        else:
            page = PAGE.replace("__RUBRIC__", json.dumps(RUBRIC.replace("**", ""))).replace("__FILE__", CSV_PATH.name)
            self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")

    def do_POST(self) -> None:
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        field, value = body.get("field"), str(body.get("value", ""))
        if field not in FIELDS or (field != "notes" and value not in {"1", "2", "3", "4", "5"}):
            return self._send(400, b"bad field/value", "text/plain")
        save(str(body.get("gold_id")), field, value)
        self._send(200, b"ok", "text/plain")

    def log_message(self, *a) -> None:
        pass


if __name__ == "__main__":
    print(f"scoring page: http://localhost:{PORT}  (saves to {CSV_PATH})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
