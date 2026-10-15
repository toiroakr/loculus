---
"loculus": minor
---

Remove the redundant `configure()` alias. Use `config(options)` to update application-wide string length and error settings, and `config()` to read them. Replace existing `configure(options)` calls with `config(options)`; partial updates and explicit `undefined` resets keep their current behavior.
