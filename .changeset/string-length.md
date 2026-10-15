---
"loculus": patch
"@loculus/rolldown": patch
---

Support custom string length counters and application-wide defaults, with optional helpers for UTF-16 code units, Unicode code points, graphemes, display columns, UTF-8 bytes and UTF-16 bytes. Generated validators honor application defaults and field overrides.

String length defaults share the existing `config()` settings with error customization. `configure()` updates the same configuration.
