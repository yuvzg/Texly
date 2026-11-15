# Pinned TeX Live installation profile for Texly LaTeX Compilation Sandbox
# Pinned scheme: scheme-full (excluding documentation and sources for image size optimization)
selected_scheme scheme-full

# Target directories
TEXDIR /usr/local/texlive
TEXMFLOCAL /usr/local/texlive/texmf-local
TEXMFSYSCONFIG /usr/local/texlive/texmf-config
TEXMFSYSVAR /usr/local/texlive/texmf-var
TEXMFVAR /tmp/texmf-var
TEXMFHOME /tmp/texmf-home

# Symlink targets
tlpdbopt_sys_bin /usr/local/bin
tlpdbopt_sys_info /usr/local/share/info
tlpdbopt_sys_man /usr/local/share/man

# Installation options: skip doc and source files to conserve space and minimize surface
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
tlpdbopt_autobackup 0
tlpdbopt_create_formats 1
tlpdbopt_desktop_integration 0
tlpdbopt_file_assocs 0
tlpdbopt_generate_updmap 0
tlpdbopt_post_code 1

instopt_adjustpath 1
instopt_adjustrepo 0
instopt_letter 0
instopt_portable 0
instopt_write18_restricted 0

