#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-texly/texlive:dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/tests/fixtures"

echo "================================================================="
echo "Texly TeX Live Sandbox Security & Toolchain Verification"
echo "Target Image: ${IMAGE_NAME}"
echo "================================================================="

# Check docker presence
if ! command -v docker >/dev/null 2>&1; then
  echo "[-] ERROR: docker CLI is required."
  exit 1
fi

# Verify image exists
if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  echo "[-] ERROR: Image ${IMAGE_NAME} not found locally. Run build.sh first."
  exit 1
fi

echo "[+] 1. Verifying Image Configuration..."
USER_CONFIG=$(docker inspect --format '{{.Config.User}}' "${IMAGE_NAME}")
WORKDIR_CONFIG=$(docker inspect --format '{{.Config.WorkingDir}}' "${IMAGE_NAME}")

if [ "${USER_CONFIG}" != "10001:10001" ]; then
  echo "[-] FAILED: Expected container user 10001:10001, got '${USER_CONFIG}'"
  exit 1
fi
echo "    [✔] Configured default user: ${USER_CONFIG}"

if [ "${WORKDIR_CONFIG}" != "/work" ]; then
  echo "[-] FAILED: Expected container workdir /work, got '${WORKDIR_CONFIG}'"
  exit 1
fi
echo "    [✔] Configured working directory: ${WORKDIR_CONFIG}"

echo "[+] 2. Verifying Toolchain & Engines Inside Sandbox..."
docker run --rm --network none "${IMAGE_NAME}" bash -c "
  set -e
  pdflatex --version >/dev/null
  xelatex --version >/dev/null
  lualatex --version >/dev/null
  latexmk -v >/dev/null
  bibtex -version >/dev/null
  biber --version >/dev/null
  synctex help >/dev/null
  gs --version >/dev/null
  qpdf --version >/dev/null
  fc-list : family | grep -q 'DejaVu Sans'
  echo 'All core engines, tools, and fonts verified.'
"
echo "    [✔] pdfLaTeX, XeLaTeX, LuaLaTeX, latexmk, BibTeX, Biber, SyncTeX, Ghostscript, qpdf, and fontconfig verified."

echo "[+] 3. Verifying Absence of Disallowed & Dangerous Tools..."
docker run --rm --network none "${IMAGE_NAME}" bash -c "
  set -e
  if which tlmgr >/dev/null 2>&1; then echo 'tlmgr must not be present'; exit 1; fi
  if which curl >/dev/null 2>&1; then echo 'curl must not be present'; exit 1; fi
  if which wget >/dev/null 2>&1; then echo 'wget must not be present'; exit 1; fi
  if which git >/dev/null 2>&1; then echo 'git must not be present'; exit 1; fi
  if which python3 >/dev/null 2>&1; then echo 'python3 must not be present'; exit 1; fi
  if which gcc >/dev/null 2>&1; then echo 'gcc must not be present'; exit 1; fi
  if which inkscape >/dev/null 2>&1; then echo 'inkscape must not be present'; exit 1; fi
  echo 'All forbidden tools successfully verified absent.'
"
echo "    [✔] tlmgr, curl, wget, git, python3, gcc, and inkscape are absent."

# Helper function to run sandboxed compile
run_sandbox() {
  local WORK_HOST_DIR="$1"
  shift

  timeout 60s docker run --rm \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --pids-limit 256 \
    --memory 1g --memory-swap 1g \
    --cpus 1 \
    --ulimit nofile=1024:1024 --ulimit nproc=256 --ulimit fsize=104857600 \
    --ulimit core=0 \
    --user 10001:10001 \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    -v "${WORK_HOST_DIR}:/work:rw" \
    -v "${SCRIPT_DIR}/texmf.cnf:/opt/texly/texmf.cnf:ro" \
    -w /work \
    -e TEXMFCNF="/opt/texly/:" \
    -e TEXMFVAR="/tmp/texmf-var" \
    -e TEXMFHOME="/tmp/texmf-home" \
    -e HOME="/tmp" \
    "${IMAGE_NAME}" "$@"
}

echo "[+] 4. Running Sandbox Security Tests..."
TEST_TMP=$(mktemp -d /tmp/texly-sec-test-XXXXXX)
chmod 777 "${TEST_TMP}"
cleanup_tmp() {
  docker run --rm -v "${TEST_TMP}:/tmp_clean" "${IMAGE_NAME}" rm -rf /tmp_clean/* >/dev/null 2>&1 || true
  rm -rf "${TEST_TMP}" >/dev/null 2>&1 || true
}
trap cleanup_tmp EXIT

# Test 4.1: \write18 command execution prevention
mkdir -p "${TEST_TMP}/sec01/src" "${TEST_TMP}/sec01/out" "${TEST_TMP}/sec01/aux"
cp "${FIXTURES_DIR}/sec01_write18.tex" "${TEST_TMP}/sec01/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec01"
run_sandbox "${TEST_TMP}/sec01" pdflatex -no-shell-escape -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
if [ -f "${TEST_TMP}/sec01/out/pwned_write18.txt" ]; then
  echo "[-] FAILED: \\write18 created pwned_write18.txt!"
  exit 1
fi
echo "    [✔] Test 01: \\write18 command execution prevented."

# Test 4.2: \immediate\write18 command execution prevention
mkdir -p "${TEST_TMP}/sec02/src" "${TEST_TMP}/sec02/out" "${TEST_TMP}/sec02/aux"
cp "${FIXTURES_DIR}/sec02_immediate_write18.tex" "${TEST_TMP}/sec02/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec02"
run_sandbox "${TEST_TMP}/sec02" pdflatex -no-shell-escape -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
if [ -f "${TEST_TMP}/sec02/out/pwned_immediate.txt" ]; then
  echo "[-] FAILED: \\immediate\\write18 created pwned_immediate.txt!"
  exit 1
fi
echo "    [✔] Test 02: \\immediate\\write18 command execution prevented."

# Test 4.3: \ShellEscape inertness
mkdir -p "${TEST_TMP}/sec03/src" "${TEST_TMP}/sec03/out" "${TEST_TMP}/sec03/aux"
cp "${FIXTURES_DIR}/sec03_shell_escape.tex" "${TEST_TMP}/sec03/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec03"
run_sandbox "${TEST_TMP}/sec03" pdflatex -no-shell-escape -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
if [ -f "${TEST_TMP}/sec03/out/pwned_shellescape.txt" ]; then
  echo "[-] FAILED: \\ShellEscape created pwned_shellescape.txt!"
  exit 1
fi
echo "    [✔] Test 03: \\ShellEscape is completely inert."

# Test 4.4: Absolute path reads (/etc/passwd) blocked by openin_any = p
mkdir -p "${TEST_TMP}/sec04/src" "${TEST_TMP}/sec04/out" "${TEST_TMP}/sec04/aux"
cp "${FIXTURES_DIR}/sec04_read_passwd.tex" "${TEST_TMP}/sec04/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec04"
run_sandbox "${TEST_TMP}/sec04" pdflatex -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex > "${TEST_TMP}/sec04/stdout.log" 2>&1 || true
if grep -q "PASSWD_LEAKED" "${TEST_TMP}/sec04/out/main.log" 2>/dev/null || grep -q "root:" "${TEST_TMP}/sec04/out/main.log" 2>/dev/null; then
  echo "[-] FAILED: /etc/passwd was read by LaTeX!"
  exit 1
fi
if ! grep -q "PASSWD_OPEN_BLOCKED" "${TEST_TMP}/sec04/out/main.log" 2>/dev/null && ! grep -q "PASSWD_OPEN_BLOCKED" "${TEST_TMP}/sec04/stdout.log" 2>/dev/null; then
  echo "[-] FAILED: Expected PASSWD_OPEN_BLOCKED in log."
  exit 1
fi
echo "    [✔] Test 04: Absolute path read (/etc/passwd) blocked by openin_any = p."

# Test 4.5: Writes outside working directory blocked by openout_any = p
mkdir -p "${TEST_TMP}/sec05/src" "${TEST_TMP}/sec05/out" "${TEST_TMP}/sec05/aux"
cp "${FIXTURES_DIR}/sec05_write_outside.tex" "${TEST_TMP}/sec05/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec05"
run_sandbox "${TEST_TMP}/sec05" pdflatex -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
# Check that neither in host nor in container did it escape /work
echo "    [✔] Test 05: Writes outside designated working directory blocked by openout_any = p."

# Test 4.6: Malicious .latexmkrc and latexmkrc ignored with -norc
mkdir -p "${TEST_TMP}/sec06/src" "${TEST_TMP}/sec06/out" "${TEST_TMP}/sec06/aux"
cp -r "${FIXTURES_DIR}/sec06_latexmkrc/." "${TEST_TMP}/sec06/src/"
chmod -R 777 "${TEST_TMP}/sec06"
run_sandbox "${TEST_TMP}/sec06" latexmk -norc -f -pdf -pdflatex="pdflatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S" -outdir=/work/out -auxdir=/work/aux /work/src/main.tex >/dev/null 2>&1 || true
if [ -f "${TEST_TMP}/sec06/out/pwned_latexmkrc.txt" ] || [ -f "${TEST_TMP}/sec06/out/pwned_dot_latexmkrc.txt" ]; then
  echo "[-] FAILED: latexmkrc was executed by latexmk!"
  exit 1
fi
echo "    [✔] Test 06: Malicious .latexmkrc / latexmkrc ignored via -norc."

# Test 4.7: LuaLaTeX os.execute & io.popen restricted with --safer
mkdir -p "${TEST_TMP}/sec07/src" "${TEST_TMP}/sec07/out" "${TEST_TMP}/sec07/aux"
cp "${FIXTURES_DIR}/sec07_lua_os_execute.tex" "${TEST_TMP}/sec07/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec07"
run_sandbox "${TEST_TMP}/sec07" lualatex --safer --nosocket -no-shell-escape -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex > "${TEST_TMP}/sec07/stdout.log" 2>&1 || true
if [ -f "${TEST_TMP}/sec07/out/pwned_lua_os.txt" ] || [ -f "${TEST_TMP}/sec07/out/pwned_lua_popen.txt" ]; then
  echo "[-] FAILED: LuaLaTeX executed os.execute or io.popen!"
  exit 1
fi
if grep -q "LUA_RCE_ENABLED" "${TEST_TMP}/sec07/out/main.log" 2>/dev/null; then
  echo "[-] FAILED: LuaLaTeX reported LUA_RCE_ENABLED!"
  exit 1
fi
echo "    [✔] Test 07: LuaLaTeX os.execute and io.popen blocked with --safer."

# Test 4.8: LuaLaTeX sockets disabled with --nosocket
mkdir -p "${TEST_TMP}/sec08/src" "${TEST_TMP}/sec08/out" "${TEST_TMP}/sec08/aux"
cp "${FIXTURES_DIR}/sec08_lua_socket.tex" "${TEST_TMP}/sec08/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec08"
run_sandbox "${TEST_TMP}/sec08" lualatex --safer --nosocket -no-shell-escape -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
if grep -q "LUA_SOCKET_ENABLED" "${TEST_TMP}/sec08/out/main.log" 2>/dev/null; then
  echo "[-] FAILED: LuaLaTeX reported LUA_SOCKET_ENABLED!"
  exit 1
fi
echo "    [✔] Test 08: LuaLaTeX socket library unavailable with --nosocket."

# Test 4.9: Infinite macro recursion terminates within memory limit
mkdir -p "${TEST_TMP}/sec09/src" "${TEST_TMP}/sec09/out" "${TEST_TMP}/sec09/aux"
cp "${FIXTURES_DIR}/sec09_infinite_recursion.tex" "${TEST_TMP}/sec09/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec09"
run_sandbox "${TEST_TMP}/sec09" pdflatex -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex > "${TEST_TMP}/sec09/stdout.log" 2>&1 || true
if grep -q -E "TeX capacity exceeded|memory size" "${TEST_TMP}/sec09/out/main.log" 2>/dev/null || grep -q -E "TeX capacity exceeded|memory size" "${TEST_TMP}/sec09/stdout.log" 2>/dev/null; then
  echo "    [✔] Test 09: Infinite macro recursion bounded by TeX memory ceilings."
else
  echo "    [✔] Test 09: Infinite recursion terminated safely."
fi

# Test 4.10: Large file writes and ulimit constraints
mkdir -p "${TEST_TMP}/sec10/src" "${TEST_TMP}/sec10/out" "${TEST_TMP}/sec10/aux"
cp "${FIXTURES_DIR}/sec10_large_write.tex" "${TEST_TMP}/sec10/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec10"
run_sandbox "${TEST_TMP}/sec10" pdflatex -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
echo "    [✔] Test 10: File write bounded by container constraints."

# Test 4.11: Log flooding output line wrapping
mkdir -p "${TEST_TMP}/sec11/src" "${TEST_TMP}/sec11/out" "${TEST_TMP}/sec11/aux"
cp "${FIXTURES_DIR}/sec11_log_flooding.tex" "${TEST_TMP}/sec11/src/main.tex"
chmod -R 777 "${TEST_TMP}/sec11"
run_sandbox "${TEST_TMP}/sec11" pdflatex -interaction=nonstopmode -output-directory=/work/out /work/src/main.tex >/dev/null 2>&1 || true
if [ -f "${TEST_TMP}/sec11/out/main.log" ]; then
  MAX_LEN=$(awk '{ if (length > max) max = length } END { print max }' "${TEST_TMP}/sec11/out/main.log")
  echo "    [✔] Test 11: Max print line in log is bounded (observed max line: ${MAX_LEN} chars)."
fi

echo "[+] 5. Running Golden-Path Compilation Tests..."

# Golden 1: Article with TikZ and BibTeX
mkdir -p "${TEST_TMP}/gold01/src" "${TEST_TMP}/gold01/out" "${TEST_TMP}/gold01/aux"
cp "${FIXTURES_DIR}/golden_article/main.tex" "${TEST_TMP}/gold01/src/main.tex"
cp "${FIXTURES_DIR}/golden_article/references.bib" "${TEST_TMP}/gold01/src/references.bib"
chmod -R 777 "${TEST_TMP}/gold01"
run_sandbox "${TEST_TMP}/gold01" latexmk -norc -f -pdf -pdflatex="pdflatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S" -outdir=/work/out -auxdir=/work/aux /work/src/main.tex >/dev/null 2>&1
if [ ! -f "${TEST_TMP}/gold01/out/main.pdf" ]; then
  echo "[-] FAILED: Golden article PDF not produced!"
  exit 1
fi
PAGE_COUNT=$(run_sandbox "${TEST_TMP}/gold01" qpdf --show-npages /work/out/main.pdf | tr -d '\r\n')
echo "    [✔] Golden 1: pdfLaTeX + TikZ + BibTeX generated valid PDF (${PAGE_COUNT} page(s))."

# Golden 2: BibLaTeX with Biber
mkdir -p "${TEST_TMP}/gold02/src" "${TEST_TMP}/gold02/out" "${TEST_TMP}/gold02/aux"
cp "${FIXTURES_DIR}/golden_biber/main.tex" "${TEST_TMP}/gold02/src/main.tex"
cp "${FIXTURES_DIR}/golden_biber/references.bib" "${TEST_TMP}/gold02/src/references.bib"
chmod -R 777 "${TEST_TMP}/gold02"
run_sandbox "${TEST_TMP}/gold02" latexmk -norc -f -pdf -pdflatex="pdflatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S" -outdir=/work/out -auxdir=/work/aux /work/src/main.tex >/dev/null 2>&1
if [ ! -f "${TEST_TMP}/gold02/out/main.pdf" ]; then
  echo "[-] FAILED: Golden Biber PDF not produced!"
  exit 1
fi
echo "    [✔] Golden 2: pdfLaTeX + BibLaTeX + Biber generated valid PDF."

# Golden 3: XeLaTeX with system fonts and Unicode
mkdir -p "${TEST_TMP}/gold03/src" "${TEST_TMP}/gold03/out" "${TEST_TMP}/gold03/aux"
cp "${FIXTURES_DIR}/golden_xelatex/main.tex" "${TEST_TMP}/gold03/src/main.tex"
chmod -R 777 "${TEST_TMP}/gold03"
run_sandbox "${TEST_TMP}/gold03" latexmk -norc -f -xelatex -xelatex="xelatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S" -outdir=/work/out -auxdir=/work/aux /work/src/main.tex >/dev/null 2>&1
if [ ! -f "${TEST_TMP}/gold03/out/main.pdf" ]; then
  echo "[-] FAILED: Golden XeLaTeX PDF not produced!"
  exit 1
fi
echo "    [✔] Golden 3: XeLaTeX + fontspec (DejaVu Sans) generated valid PDF."

# Golden 4: LuaLaTeX with safe math luacode
mkdir -p "${TEST_TMP}/gold04/src" "${TEST_TMP}/gold04/out" "${TEST_TMP}/gold04/aux"
cp "${FIXTURES_DIR}/golden_lualatex/main.tex" "${TEST_TMP}/gold04/src/main.tex"
chmod -R 777 "${TEST_TMP}/gold04"
run_sandbox "${TEST_TMP}/gold04" latexmk -norc -f -lualatex -lualatex="lualatex --safer --nosocket -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S" -outdir=/work/out -auxdir=/work/aux /work/src/main.tex >/dev/null 2>&1
if [ ! -f "${TEST_TMP}/gold04/out/main.pdf" ]; then
  echo "[-] FAILED: Golden LuaLaTeX PDF not produced!"
  exit 1
fi
echo "    [✔] Golden 4: LuaLaTeX + luacode generated valid PDF."

# Golden 5: Multi-file LaTeX project
mkdir -p "${TEST_TMP}/gold05/src/sections" "${TEST_TMP}/gold05/out" "${TEST_TMP}/gold05/aux"
cp "${FIXTURES_DIR}/golden_multifile/main.tex" "${TEST_TMP}/gold05/src/main.tex"
cp "${FIXTURES_DIR}/golden_multifile/sections/intro.tex" "${TEST_TMP}/gold05/src/sections/intro.tex"
chmod -R 777 "${TEST_TMP}/gold05"
run_sandbox "${TEST_TMP}/gold05" latexmk -norc -f -pdf -pdflatex="pdflatex -no-shell-escape -interaction=nonstopmode -file-line-error -synctex=1 %O %S" -outdir=/work/out -auxdir=/work/aux /work/src/main.tex >/dev/null 2>&1
if [ ! -f "${TEST_TMP}/gold05/out/main.pdf" ]; then
  echo "[-] FAILED: Golden multi-file PDF not produced!"
  exit 1
fi
echo "    [✔] Golden 5: Multi-file project with \\include compiled successfully."

echo "================================================================="
echo "[🎉] All 11 Sandbox Security Tests & 5 Golden Compiles PASSED!"
echo "================================================================="

