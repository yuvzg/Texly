import type { ProjectTemplate } from '@texly/shared';

export interface TemplateFile {
  name: string;
  path: string;
  isMain: boolean;
  mimeType: string;
  content: string;
}

export function getTemplateFiles(template: ProjectTemplate = 'blank', projectName: string): TemplateFile[] {
  switch (template) {
    case 'article':
      return [
        {
          name: 'main.tex',
          path: 'main.tex',
          isMain: true,
          mimeType: 'application/x-tex',
          content: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{cite}

\\title{${escapeLatex(projectName)}}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract goes here.
\\end{abstract}

\\section{Introduction}
Introduction to the article. Reference to foundational paper: \\cite{sample2026}.

\\section{Methodology}
Describe your methodology here.

\\section{Results}
Present your findings here.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,
        },
        {
          name: 'references.bib',
          path: 'references.bib',
          isMain: false,
          mimeType: 'application/x-bibtex',
          content: `@article{sample2026,
  author = {Author, A.},
  title = {A Sample Reference Paper},
  journal = {Journal of LaTeX Research},
  year = {2026},
  volume = {1},
  pages = {1--10}
}
`,
        },
      ];

    case 'report':
      return [
        {
          name: 'main.tex',
          path: 'main.tex',
          isMain: true,
          mimeType: 'application/x-tex',
          content: `\\documentclass[12pt]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{${escapeLatex(projectName)}}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle
\\tableofcontents

\\chapter{Introduction}
Introduction to the report.

\\chapter{Methodology}
Methodology details.

\\chapter{Conclusion}
Summary of outcomes.

\\end{document}
`,
        },
      ];

    case 'beamer':
      return [
        {
          name: 'main.tex',
          path: 'main.tex',
          isMain: true,
          mimeType: 'application/x-tex',
          content: `\\documentclass{beamer}
\\usetheme{Madrid}

\\title{${escapeLatex(projectName)}}
\\subtitle{A Texly Presentation}
\\author{Presenter Name}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}
\\frametitle{Overview}
\\begin{itemize}
  \\item First Point
  \\item Second Point
  \\item Key Takeaways
\\end{itemize}
\\end{frame}

\\begin{frame}
\\frametitle{Key Insights}
\\begin{block}{Important Result}
Formulas render cleanly: $E = mc^2$.
\\end{block}
\\end{frame}

\\end{document}
`,
        },
      ];

    case 'ieee-conference':
      return [
        {
          name: 'main.tex',
          path: 'main.tex',
          isMain: true,
          mimeType: 'application/x-tex',
          content: `\\documentclass[conference]{IEEEtran}
\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}

\\begin{document}

\\title{${escapeLatex(projectName)}}
\\author{\\IEEEauthorblockN{Author Name}
\\IEEEauthorblockA{\\textit{Department of Computer Science} \\\\
\\textit{University Name} \\\\
City, Country \\\\
email@example.com}}

\\maketitle

\\begin{abstract}
This document provides formatting guidelines for IEEE conference proceedings.
\\end{abstract}

\\section{Introduction}
Welcome to Texly IEEE conference paper template.

\\section{Related Work}
See prior research \\cite{sample2026}.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`,
        },
        {
          name: 'references.bib',
          path: 'references.bib',
          isMain: false,
          mimeType: 'application/x-bibtex',
          content: `@article{sample2026,
  author = {Author, A.},
  title = {A Sample IEEE Reference},
  journal = {IEEE Transactions on Software Engineering},
  year = {2026}
}
`,
        },
      ];

    case 'resume':
      return [
        {
          name: 'main.tex',
          path: 'main.tex',
          isMain: true,
          mimeType: 'application/x-tex',
          content: `\\documentclass[10pt,letterpaper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{enumitem}

\\begin{document}

\\begin{center}
  {\\LARGE \\textbf{Your Name}} \\\\
  \\vspace{4pt}
  email@example.com $\\cdot$ (555) 123-4567 $\\cdot$ City, Country
\\end{center}

\\section*{Experience}
\\textbf{Software Engineer} \\hfill 2024 -- Present \\\\
Company Name \\hfill City, State
\\begin{itemize}[noitemsep]
  \\item Built collaborative LaTeX editor features and container orchestration.
\\end{itemize}

\\section*{Education}
\\textbf{B.S. in Computer Science} \\hfill 2020 -- 2024 \\\\
University Name

\\section*{Skills}
\\textbf{Languages}: LaTeX, TypeScript, Go, Python.

\\end{document}
`,
        },
      ];

    case 'blank':
    default:
      return [
        {
          name: 'main.tex',
          path: 'main.tex',
          isMain: true,
          mimeType: 'application/x-tex',
          content: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}

\\title{${escapeLatex(projectName)}}
\\author{Texly Author}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Welcome to your new document!

\\end{document}
`,
        },
      ];
  }
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, '\\$&')
    .replace(/[$%_&#^]/g, '\\$&');
}

