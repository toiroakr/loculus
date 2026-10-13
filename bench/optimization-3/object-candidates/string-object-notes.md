# Dedicated string-only object loop candidates

Baseline snapshot: `string-object-baseline3.ts.txt`, copied from the latest production source at preparation time. Five candidate snapshots and their hashes are listed in `string-object-manifest.json`. Production source, existing baseline snapshots, and shared manifest are untouched.

| Candidate | Classifier | Minimum shape width |
| --- | --- | --- |
| string-object-every-all | validators.every after original capture loop | 1 |
| string-object-every-32 | validators.every after original capture loop | 32 |
| string-object-loopflag-all | boolean updated in existing capture loop | 1 |
| string-object-loopflag-32 | boolean updated in existing capture loop | 32 |

Empty shapes always use the original validator. Eligibility requires the captured function identity to equal the private shared validateString function for every child. Presence wrappers, constrained strings, custom validators, and opaque fields retain the generic loop. Descriptive-only string fields may qualify when they use the same pure validator. Metadata does not classify a field.

Each Standard getter is captured once, exactly where the original constructor reads it. The every variants perform classification only after all getters finish. The loopflag variants compare each captured validator immediately; comparison has no user callbacks and later getters still run in the original order.

The dedicated top-level validateStringObject function removes dynamic validator calls and Result allocation for valid strings. It performs the original own-property lookup immediately before each raw property access, then the same ordinary assignment or __proto__ defineProperty. Invalid values still call validateString and execute the original issue-copy loop, preserving issue contents, ordering, iterator behavior, and path construction. strict and passthrough loops are copied without modification. No public property/prototype/meta/compile changes are intended.

The every variants add a second array scan and an every callback. Width32 avoids this scan for small shapes and all variants short-circuit on the first non-string validator. The loopflag variants avoid a second scan/callback but enlarge the constructor's capture loop and add a boolean guard on every captured child. Their width32 versions still update a false boolean for small shapes unless the engine folds that branch. They may therefore trade validation speed for construction speed or inlining behavior.

Size risk: helper code duplicates object input checks, output setup, and strict/passthrough handling. The specialized wrapper and classifier add further bytes. Tree shaking cannot remove the generic loop because mixed objects remain supported. The fifth candidate limits specialization to strip mode to reduce this duplication.

`verify-string-object.mjs` transpiles/imports only these candidates and their own baseline. All five candidates passed 96 semantic scenarios plus CSP fallback, covering boundaries 0/1/31/32/33/100, unknown-key modes, child Standard getters, input Proxy trap order, and excluded presence/custom/accessor validators. See `string-object-semantics-results.json`.

As with other constructor experiments, arbitrary monkey-patching of Array.prototype.every during a child Standard getter can affect the every classifier and is a new observable built-in use. The loopflag variants avoid that additional hook.

## Fifth candidate: strip only

`string-object-every-32-strip` classifies only after the original mode read. It specializes width>=32, pure-string, strip-mode objects; all strict/passthrough objects retain the generic validator. The top-level helper takes only input/keys and omits all unknown-key handling and the fields/mode parameters. The existing verifier discovers the fifth candidate through its manifest.

`verify-number-proxy.mjs` separately tests opaque callable Proxy validators receiving numeric raw input. The baseline passed 58 scenarios. Number-native-elision failed three: an additional get trap in ordinary validation, an exception from that trap before apply, and the exception during explicit-compile fallback validation. Compile-time events are recorded independently and reset before validation. The candidate was rejected before timing; see `number-proxy-semantics-results.json`.

## Measured decision

`../string-object-screen-results.json` contains a three-process exploratory screen on both engines. For width 100, Bun valid validation improved from about 731 ns to 662–665 ns, while construction plus one validation increased from about 3,104 ns to 5,156–5,594 ns. Node valid validation stayed around 5,981 ns; invalid validation improved from about 2,244 ns to 1,784–1,891 ns. All object bundles grew by 156–220 gzip bytes. These are screening medians, not statistically significant claims. All five candidates were rejected because their limited repeat-validation gains did not justify construction regressions and size increases.
