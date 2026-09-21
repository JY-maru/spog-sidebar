"""공개용 저장소 점검. 통과해도 '검사하지 않는 것' 목록을 함께 읽어야 한다."""
import hashlib, json, pathlib, re, subprocess, sys

fails = []
warns = []

# 실제 식별자는 이 스크립트에 평문으로 적지 않는다(금칙어 목록 자체가 검색 힌트가 되므로).
# 솔트 + sha256 앞 16자리만 남기고, 후보 문자열을 같은 방식으로 해싱해 비교한다.
SALT = "spog-mock-2026"
SECRET_HASHES = {
    "c6281d16957f8e56", "2e81ad63b2cce8fa", "a98db5c81a9677c2", "6ae38e0d86b81877",
}
SECRET_LENS = (4, 5, 6)


def secret_hits(text):
    """해시된 실제 식별자가 text에 있으면 (줄번호, 해시) 목록을 돌려준다."""
    low = text.lower()
    hits = []
    for n in SECRET_LENS:
        for i in range(len(low) - n + 1):
            h = hashlib.sha256((SALT + low[i:i + n]).encode()).hexdigest()[:16]
            if h in SECRET_HASHES:
                hits.append((text[:i].count("\n") + 1, h))
    return hits


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], capture_output=True, text=True)
    return [p for p in out.stdout.split("\0") if p]


def read_text(p):
    try:
        return pathlib.Path(p).read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


# 1. manifest가 유효한 JSON이고 참조하는 파일이 모두 존재하는지
mf = json.loads(pathlib.Path("extension/manifest.json").read_text(encoding="utf-8"))
refs = [mf["background"]["service_worker"]]
for cs in mf["content_scripts"]:
    refs += cs["js"] + cs.get("css", [])
for war in mf.get("web_accessible_resources", []):
    refs += war["resources"]
for r in refs:
    if not pathlib.Path("extension", r).exists():
        fails.append(f"manifest references missing file: {r}")

# 2. HTML 내부 앵커 대상이 존재하는지
html = pathlib.Path("docs/user-guide.html").read_text(encoding="utf-8")
ids = set(re.findall(r'id="([^"]+)"', html))
anchors = set(re.findall(r'href="#([^"]+)"', html))
for a in sorted(anchors - ids - {"id"}):  # "#id"는 JS 주석 안에만 나온다
    fails.append(f"user-guide anchor with no target: #{a}")

# 3. 추적 대상 텍스트 파일 전체에서 금칙어 검사
#    (a) 해시로만 보관한 실제 식별자, (b) 공개해도 무해한 일반 토큰은 분할 리터럴로
GENERIC = ["sites." + "google", "구" + "글", "PSEUDO" + "CODE",
           "content_" + "a", "content_" + "b", "injected_" + "b"]
text_files = []
for p in tracked_files():
    body = read_text(p)
    if body is None:
        continue
    text_files.append((p, body))
    scan = re.sub(r'src="data:[^"]*"', 'src="[img]"', body)  # base64 블롭은 제외(아래 고지 참고)
    for line, h in secret_hits(scan):
        fails.append(f"{p}:{line} 실제 식별자(해시 {h})")
    for g in GENERIC:
        if g in scan:
            fails.append(f"{p}: 금칙 토큰 {g!r}")

# 3-1. CLAUDE.md는 추적되면 안 된다
if "CLAUDE.md" in tracked_files():
    fails.append("CLAUDE.md가 추적 파일에 포함돼 있다 — 공개 저장소에서 제외할 것")

# 4. 코드가 참조하는 호스트는 전부 로컬 목(mock)이어야 한다
code_exts = (".js", ".ts", ".tsx", ".json", ".md", ".css", ".html")
code_files = [(p, b) for p, b in text_files if p.endswith(code_exts)]
for p, body in code_files:
    for host in re.findall(r"https?://([A-Za-z0-9.\-]+)", body):
        if host not in ("localhost",) and "img.shields.io" not in host \
           and "jy-maru.github.io" not in host and "github.com" not in host:
            fails.append(f"{p}: non-mock host {host}")

# 5. 공개 진입 문서 3종에 mock 고지가 있는지
for path, needle in [("README.md", "모형(mock)"),
                     ("docs/ARCHITECTURE.md", "전부 모형(mock)"),
                     ("docs/user-guide.html", "모형(mock) 프로젝트의 설명서")]:
    if needle not in pathlib.Path(path).read_text(encoding="utf-8"):
        fails.append(f"{path}: missing mock notice")

# 6. 주석 스타일 — 회고형 서술, 취약점 힌트, 전제 명시형 서술은 남기지 않는다.
#    전제 명시형: 가드가 "무엇을 하지 않는지"를 알려주는 문장(깨뜨릴 조건을 그대로 알려줌)
RETROSPECTIVE = ["예전엔", "예전 방식", "원래는", "과거엔", "과거 이", "이전에는", "했었",
                 "버그가 났", "버그가 여기서", "폐기됨", "1차 증상", "끊겼던",
                 "가장 까다로웠", "여러 라운드", "삽질", "war story"]
SECURITY_HINT = ["우회하면", "우회해서", "뚫린", "뚫을", "공격자", "해킹", "익스플로잇",
                 "검증을 빠뜨", "구멍이었", "안 막으면", "막지 않으면", "없으면 통과",
                 "바이패스", "bypass",
                 "전제로 한", "전제하에", "만 적용", "차단하지 않고", "경고만"]

for p, body in code_files:
    for i, line in enumerate(body.splitlines(), 1):
        stripped = line.strip()
        if not (stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("#")):
            continue
        for phrase in RETROSPECTIVE:
            if phrase in line:
                fails.append(f"{p}:{i} 회고형 주석 ({phrase!r})")
        for phrase in SECURITY_HINT:
            if phrase in line:
                fails.append(f"{p}:{i} 취약점/전제 노출 주석 ({phrase!r})")

# 7. git 이력 검사 — 이력은 파일 수정으로 고칠 수 없으므로 경고로만 보고한다.
try:
    log = subprocess.run(
        ["git", "log", "-p", "--all", "--",
         "*.ts", "*.js", "*.tsx", "*.json", "*.md", "*.html", "*.css", "*.py"],
        capture_output=True, text=True, errors="replace", timeout=300)
    if log.returncode != 0:
        warns.append(f"git 이력 검사 실패 — 실행 불가 (git log rc={log.returncode})")
    else:
        hist = re.sub(r'src="data:[^"]*"', 'src="[img]"', log.stdout)
        hashes = {h for _, h in secret_hits(hist)}
        for h in sorted(hashes):
            warns.append(f"git 이력에 실제 식별자 흔적 (해시 {h}) — 이력 재작성 필요")
        for g in GENERIC:
            if g in hist:
                warns.append(f"git 이력에 금칙 토큰 {g!r}")
        if not hashes:
            print("(git 이력 검사 실행됨)")
except (OSError, subprocess.SubprocessError) as e:
    warns.append(f"git 이력 검사 실행 불가: {e}")

NOT_CHECKED = """이 스크립트가 검사하지 않는 것 (0건이어도 '정제 완료'가 아니다):
  - 이미지 안의 글자: base64로 문서에 박힌 스크린샷 내용은 전혀 읽지 않는다
  - docs/demo.mp4, docs/demo.gif, docs/architecture.png 등 미디어 파일 내용
  - 바이너리 파일 전반, 커밋 메시지 본문
  - git 이력은 텍스트 확장자 diff만 훑는다(경고로만 보고, 삭제되지 않음)"""

print(f"checks run. failures: {len(fails)}, warnings: {len(warns)}")
print(NOT_CHECKED)
for w in warns:
    print("  WARN", w)
for f in fails:
    print("  FAIL", f)
sys.exit(1 if fails else 0)
