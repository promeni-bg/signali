"""ЦИК's 2026 section list (the unified xlsx) -> src/sections.json, the place of every section ID."""
import sys, json, openpyxl
sys.stdout.reconfigure(encoding="utf-8")
xlsx, out = sys.argv[1:3]
ws = openpyxl.load_workbook(xlsx, read_only=True).worksheets[0]
it = ws.iter_rows(values_only=True); hdr = list(next(it))
col = {h: i for i, h in enumerate(hdr)}
def g(r, h): v = r[col[h]]; return "" if v is None else str(v).strip()
res = {}
for r in it:
    sid = g(r, "Секция ID")
    voters = r[col["Брой избиратели"]]
    # [МИР код, МИР, област, община, район, населено място, адрес, избиратели]
    res[sid] = [g(r, "МИР код"), g(r, "МИР"), g(r, "Област"), g(r, "Община"), g(r, "Район"),
                g(r, "Населено място"), g(r, "Адрес"), int(voters) if voters is not None else None]
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(res), "sections ->", out)
