# Agent object constructor exploration

No production, dist, shared manifest, or previous report changes. No builds, tests, validation runs, or timing. `agent-prepare.mjs` has only generated four isolated source snapshots from optimization4's pinned baseline. Hashes are in `agent-manifest.json`; candidate snapshots have not been changed after the parent began screening them.

## Private basic-string validator array omission

- `agent-deferred-string`: captures every child Standard validator in the existing order, but delays validators[] allocation until the first validator different from private validateString. Prior basic validators are then copied into the new array; subsequent validators are appended. All-basic string shapes allocate no validator array. The loop still uses ordinary frozen shape/keys and the original Result inspection/write/error paths.
- `agent-single-string`: width1 basic strings avoid the validator array. Width1 opaque validators still get a one-element array; other widths use the original array capture loop.
- Corresponding `-fast` versions combine the above with the already explored direct no-options string field factory. Each field gets independent meta/std objects, unchanged own properties and standard wrapper descriptors.

Expected savings: one internal validator-array allocation for all-basic string objects (or just width1). Single avoids generic capture loop overhead for width1. Deferred adds classifier comparisons and may need backfill on mixed shapes. Validation now branches on the array being present, which may cost more than the saved construction allocation and may increase bundle size. No measured benefit is asserted.

Only private validateString may be called without its original array receiver. Opaque validators retain `validators[i](value)` and thus the fully captured validators array as this, matching baseline even when a callback examines this.length or other entries. A general all-identical opaque-validator optimization was rejected because replacing that receiver would change behavior.

Standard/field getters, validator invocation order, result.issues/value accessor counts, raw own/get accesses, optional/default omission and ordinary output writes are intended to remain unchanged. The original shape clone/freeze, snapshots, symbols, __proto__ defineProperty, unknown-key loops, error paths, meta/std independence and public reflection shape remain unchanged.

The array-allocation experiment does change private constructor Array operations. Code that monkey-patches Array.prototype.push/fill, or installs inherited integer-index setters, could observe different constructor behavior. For example, baseline push events happen after every child capture; deferred pushes past basic validators later on first divergence. This assumption must be weighed separately from public Standard/result/input getter parity. No Array.fill is used in these candidates.

## Bundle constraints

Root string(options) makes presence/default parsing and target validation, trim/min/max/pattern state restoration, and private compile plan attachment reachable even for a basic usage. Removing their behavior or sharing mutable/independent metadata violates the requested contract. Removing the generic Array/Date default distinction only for string also changes accepted runtime input behavior. The already explored compact-field candidate merges duplicate return factories, but the parent's size check indicates a small saving rather than the approximately200 gzip bytes needed.

No source-only proposal here establishes that full API can drop200 gzip bytes. A separate bare string entry would make feature code unreachable, but it introduces another API and is intentionally not prepared as a shortcut. Validate-array omission targets constructor allocation; any size improvement remains for the parent's isolated bundle measurements to establish.
