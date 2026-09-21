"""Sanity checks for the sanitized open-source repo. Fails loudly."""
import json, pathlib, re, sys

fails = []

# 1. manifest is valid JSON and every referenced file exists
mf = json.loads(pathlib.Path("extension/manifest.json").read_text(encoding="utf-8"))
refs = [mf["background"]["service_worker"]]
for cs in mf["content_scripts"]:
    refs += cs["js"] + cs.get("css", [])
for war in mf.get("web_accessible_resources", []):
    refs += war["resources"]
for r in refs:
    if not pathlib.Path("extension", r).exists():
        fails.append(f"manifest references missing file: {r}")

# 2. HTML: every in-page anchor target exists, and vice-versa for section links
html = pathlib.Path("docs/user-guide.html").read_text(encoding="utf-8")
ids = set(re.findall(r'id="([^"]+)"', html))
anchors = set(re.findall(r'href="#([^"]+)"', html))
for a in sorted(anchors - ids - {"id"}):  # "#id" appears only inside a JS comment
    fails.append(f"user-guide anchor with no target: #{a}")

# 3. no real identifiers left in text (base64 blobs excluded)
text_only = re.sub(r'src="data:[^"]*"', 'src="[img]"', html)
banned = ["socarcorp", "sites.google", "SOCAR", "okstra", "옥스트라", "사고관리자", "구글"]
for b in banned:
    for m in re.finditer(re.escape(b), text_only):
        line = text_only[:m.start()].count("\n") + 1
        fails.append(f"user-guide:{line} banned token {b!r}")

code_files = [p for pat in ("extension/**/*.js", "extension/**/*.ts", "extension/**/*.tsx",
                            "extension/**/*.json", "docs/*.md", "README.md")
              for p in pathlib.Path(".").glob(pat) if p.is_file()]
for p in code_files:
    body = p.read_text(encoding="utf-8")
    for b in ["socarcorp", "sites.google", "SOCAR", "okstra", "옥스트라",
              "PSEUDOCODE", "content_a", "content_b", "injected_b"]:
        if b in body:
            fails.append(f"{p}: banned token {b!r}")

# 4. every host referenced in code is a localhost mock
for p in code_files:
    for host in re.findall(r"https?://([A-Za-z0-9.\-]+)", p.read_text(encoding="utf-8")):
        if host not in ("localhost",) and "img.shields.io" not in host \
           and "jy-maru.github.io" not in host and "github.com" not in host:
            fails.append(f"{p}: non-mock host {host}")

# 5. the mock notice is present in all three public entry documents
for path, needle in [("README.md", "모형(mock)"),
                     ("docs/ARCHITECTURE.md", "전부 모형(mock)"),
                     ("docs/user-guide.html", "모형(mock) 프로젝트의 설명서")]:
    if needle not in pathlib.Path(path).read_text(encoding="utf-8"):
        fails.append(f"{path}: missing mock notice")


# 6. 주석 스타일 — 회고형 서술과 취약점 힌트는 공개 저장소에 남기지 않는다.
#    회고형: 개발 과정을 서사로 적은 것 ("예전엔", "버그가 났었다", "두 번 끊겼다")
#    취약점 힌트: 가드가 없을 때 무엇이 뚫리는지, 어떻게 우회하는지 적은 것
RETROSPECTIVE = ["예전엔", "예전 방식", "원래는", "과거엔", "과거 이", "이전에는", "했었",
                 "버그가 났", "버그가 여기서", "폐기됨", "1차 증상", "끊겼던",
                 "가장 까다로웠", "여러 라운드", "삽질", "war story"]
SECURITY_HINT = ["우회하면", "우회해서", "뚫린", "뚫을", "공격자", "해킹", "익스플로잇",
                 "검증을 빠뜨", "구멍이었", "안 막으면", "막지 않으면", "없으면 통과",
                 "바이패스", "bypass"]

for p_ in code_files:
    body = p_.read_text(encoding="utf-8")
    for i, line in enumerate(body.splitlines(), 1):
        stripped = line.strip()
        if not (stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("#")):
            continue
        for phrase in RETROSPECTIVE:
            if phrase in line:
                fails.append(f"{p_}:{i} 회고형 주석 ({phrase!r})")
        for phrase in SECURITY_HINT:
            if phrase in line:
                fails.append(f"{p_}:{i} 취약점 힌트 주석 ({phrase!r})")

print(f"checks run. failures: {len(fails)}")
for f in fails:
    print("  FAIL", f)
sys.exit(1 if fails else 0)
