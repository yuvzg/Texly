# syntax=docker/dockerfile:1
# Pinned Debian Bookworm slim base image
FROM debian:bookworm-20241111-slim AS runner

LABEL maintainer="Texly Security Team <security@texly.app>" \
      description="Hardened TeX Live compilation sandbox for untrusted LaTeX workloads" \
      version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

# 1. Install system utilities and runtime tools:
#    - ghostscript, fontconfig, qpdf
#    - Perl runtime (strictly required by latexmk)
#    - Curated font families for XeLaTeX and LuaLaTeX
#    - Build/install dependencies (curl, ca-certificates, xz-utils) purged after installation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        perl \
        libfile-which-perl \
        ghostscript \
        fontconfig \
        qpdf \
        fonts-freefont-ttf \
        fonts-liberation \
        fonts-dejavu-core \
        fonts-noto-core \
        fonts-lmodern \
        fonts-texgyre \
        curl \
        ca-certificates \
        xz-utils && \
    fc-cache -f -v

# 2. Copy TeX Live installation profile and security configuration
COPY texlive.profile /tmp/texlive.profile
COPY texmf.cnf /opt/texly/texmf.cnf

# 3. Download and execute official install-tl installer
RUN mkdir -p /tmp/install-tl && \
    curl -sSL https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz | \
        tar -xz --strip-components=1 -C /tmp/install-tl && \
    /tmp/install-tl/install-tl \
        --profile=/tmp/texlive.profile \
        --no-interaction && \
    rm -rf /tmp/install-tl /tmp/texlive.profile

# 4. Set TeX Live binaries in PATH and verify core engines and utilities
ENV PATH="/usr/local/texlive/bin/x86_64-linux:${PATH}" \
    TEXMFCNF="/opt/texly/:" \
    TEXMFVAR="/tmp/texmf-var" \
    TEXMFHOME="/tmp/texmf-home" \
    HOME="/tmp"

# 5. Lock down runtime security:
#    - Remove tlmgr (prevent runtime package downloads or network access)
#    - Purge download and packaging tools (curl, ca-certificates, xz-utils)
#    - Ensure git, wget, ssh, Python, compilers are NOT present
#    - Retain only Perl and TeX binaries
RUN rm -f /usr/local/bin/tlmgr /usr/local/texlive/bin/x86_64-linux/tlmgr && \
    apt-get purge -y curl ca-certificates xz-utils && \
    apt-get autoremove -y --purge && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 6. Create dedicated unprivileged non-root user (UID 10001, GID 10001)
#    - Restrict system credentials permissions (user 10001 cannot read /etc/passwd or /etc/shadow)
#    - Create designated working directory (/work) and temp directories
#    - Restrict write permissions exclusively to /work and /tmp
RUN groupadd -g 10001 texly && \
    useradd -u 10001 -g 10001 -m -s /bin/bash texly && \
    chmod 600 /etc/passwd /etc/shadow && \
    mkdir -p /work /work/src /work/out /work/aux /opt/texly /tmp/texmf-var /tmp/texmf-home && \
    chown -R texly:texly /work /tmp/texmf-var /tmp/texmf-home && \
    chmod 644 /opt/texly/texmf.cnf && \
    chmod 777 /tmp

# 7. Verification sanity checks during build
RUN pdflatex --version && \
    xelatex --version && \
    lualatex --version && \
    latexmk -v && \
    bibtex -version && \
    biber --version && \
    synctex help && \
    gs --version && \
    qpdf --version && \
    fc-list : family | head -n 5 && \
    ! which tlmgr && \
    ! which curl && \
    ! which wget && \
    ! which git && \
    ! which python3 && \
    ! which gcc && \
    ! which inkscape

USER 10001:10001
WORKDIR /work

CMD ["latexmk", "-v"]

