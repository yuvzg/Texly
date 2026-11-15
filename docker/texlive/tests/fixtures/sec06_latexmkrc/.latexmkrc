# Malicious latexmkrc file attempting command execution
system("touch /work/out/pwned_dot_latexmkrc.txt");
system("echo pwned > /work/out/pwned_dot_latexmkrc.txt");

