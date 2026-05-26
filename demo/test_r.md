---
kernelspec:
  name: ir
  display_name: R
  language: R
language_info:
  name: R
  codemirror_mode: r
  pygments_lexer: r
  mimetype: text/x-r-source
  file_extension: .r
  version: "4.5.1"
---

# R Kernel Auto-detect Test

Since you now have the R kernel installed, the extension should read the `language_info` block, scan your installed kernels, find the `ir` (R) kernel, and dynamically bind it to this file upon opening!

```{code-cell}
:trusted: true

# R Code!
greeting <- "Hello from the dynamically loaded R kernel!"
print(greeting)

x <- c(1, 2, 3, 4, 5)
mean(x)
```

```{code-cell}
:trusted: true

```
