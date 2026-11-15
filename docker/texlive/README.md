# TeX Live Compilation Sandbox (`docker/texlive`)

This directory contains the production-oriented Docker image and security configuration for Texly's LaTeX compilation sandbox.

LaTeX compilation involves executing **untrusted, user-controlled documents**. In accordance with [COMPILATION_ENGINE.md](../../docs/COMPILATION_ENGINE.md) and [SECURITY.md](../../docs/SECURITY.md), this image provides a hardened execution environment designed for defense in depth.

---

## 1. Architecture and Requirements

| Component              | Specification                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Base Image**         | Pinned Debian Bookworm Slim (`debian:bookworm-20241111-slim`)                                                                       |
| **TeX Distribution**   | TeX Live installed via official `install-tl` with `scheme-full` profile                                                             |
| **Space Optimization** | `tlpdbopt_install_docfiles 0` and `tlpdbopt_install_srcfiles 0` (omits ~60% download volume without sacrificing macros or packages) |
| **Engines**            | `pdfLaTeX`, `XeLaTeX`, `LuaLaTeX`                                                                                                   |
| **Toolchain**          | `latexmk`, `BibTeX`, `Biber`, `SyncTeX`, `Ghostscript`, `fontconfig`, `qpdf`                                                        |
| **Curated Fonts**      | FreeFont, Liberation, DejaVu, Noto Core, Latin Modern, TeX Gyre                                                                     |
| **Excluded Software**  | `inkscape` is intentionally omitted                                                                                                 |
| **Execution User**     | Dedicated non-root user `texly` (UID: `10001`, GID: `10001`)                                                                        |
| **Runtime Hardening**  | `tlmgr` removed (no runtime package downloads); `curl`, `wget`, `git`, `ssh`, `python3`, `gcc` purged                               |

---

## 2. TeX-Level Security (`texmf.cnf`)

The custom configuration at `/opt/texly/texmf.cnf` enforces strict language-level isolation:

```ini
shell_escape = f                 # Disallow \write18 entirely
shell_escape_commands =          # Empty allowlist
openin_any = p                   # Paranoid: block absolute paths, parent traversal (..), dotfiles
openout_any = p                  # Paranoid: block writes outside current hierarchy
parse_first_line = f             # Ignore format injections (%&) on first line
max_print_line = 79              # Bound terminal output line length
error_line = 79
half_error_line = 50
main_memory = 5000000            # Memory ceilings force runaway macros to abort
hash_extra = 500000
```

---

## 3. Container Execution Policy

When invoked by the compile runner, the container must be created with the following code-enforced Docker flags:

```bash
docker run --rm \
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
  -v <jobDir>/work:/work:rw \
  -v /opt/texly/texmf.cnf:/opt/texly/texmf.cnf:ro \
  -w /work \
  -e TEXMFCNF="/opt/texly/:" \
  -e TEXMFVAR="/tmp/texmf-var" \
  -e TEXMFHOME="/tmp/texmf-home" \
  -e HOME="/tmp" \
  texly/texlive:dev \
  <latexmk argv...>
```

---

## 4. latexmk Execution Policy

The compile runner must construct arguments as an **isolated array of argv elements** (never passed through a shell string) according to [`latexmk-policy.json`](./latexmk-policy.json):

- **`-norc`**: Prevents system, user, and project-controlled `.latexmkrc` / `latexmkrc` files from executing.
- **`-no-shell-escape`**: Hard disable on all engine invocations.
- **`-interaction=nonstopmode`**: Non-interactive execution preventing terminal hangs.
- **`-file-line-error`**: Structured error reporting for IDE diagnostics.
- **`-synctex=1`**: Generates synchronization coordinates.
- **`-outdir=/work/out` & `-auxdir=/work/aux`**: Designated persistent output boundaries.
- **LuaLaTeX Flags**: `--safer` (disables unsafe Lua `os.execute` and `io.popen`) and `--nosocket` (disables network socket libraries).

---

## 5. Security & Golden Path Verification

A test suite verifying actual behavior against real containers is provided in `verify.sh`:

1. **`\write18`**: Prevents command execution.
2. **`\immediate\write18`**: Prevents immediate command execution.
3. **`\ShellEscape`**: Verified inert.
4. **Absolute Path Reads**: `/etc/passwd` reading blocked via `openin_any = p`.
5. **Path Writes**: Writes outside `/work` blocked via `openout_any = p`.
6. **Malicious `.latexmkrc`**: Project `latexmkrc` files ignored via `-norc`.
7. **LuaLaTeX RCE**: `os.execute` and `io.popen` blocked via `--safer`.
8. **LuaLaTeX Networking**: Sockets blocked via `--nosocket`.
9. **Infinite Recursion**: Terminated safely by TeX memory ceilings.
10. **Large File Writes**: Bounded by container constraints and `ulimit -f`.
11. **Log Flooding**: Output lines bounded and wrapped.
12. **Golden Compilations**: Verified for pdfLaTeX, XeLaTeX (Unicode/fonts), LuaLaTeX (safe math), BibTeX, Biber, and multi-file `\include`.

---

## 6. How to Build, Verify, and Scan

### Build the Image

```bash
./docker/texlive/build.sh
```

This builds `texly/texlive:dev` and records the resulting image digest in `docker/texlive/image-digest.txt`.

### Run Verification Suite

```bash
./docker/texlive/verify.sh texly/texlive:dev
```

### Scan for Vulnerabilities with Trivy

```bash
./docker/texlive/scan.sh texly/texlive:dev
```

Generates `trivy-report.json` and `trivy-report.txt`.
