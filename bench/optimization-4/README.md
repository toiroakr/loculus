> Historical experiment before removal of the schema compiler. Current policy and measurements: [single-use](../single-use/README.md).

# Simple string object optimization

The baseline is the production source with SHA256
`4c058388e5907fd15a2ab92cfa972cc54b4c346fad0b4f0b62a5195833e2b2cf`.
Candidates preserve independent field metadata, the frozen shape snapshot and
Standard Schema validation. No compiler generation cost is evaluated.

The first screen uses the existing three-process exploratory harness on Node
24.13.0 and Bun 1.4.3, with rotating successful/failed inputs and consumed results.
Construction includes all schema factories and one successful validation.
Screen results are hypotheses; final claims require independent process samples
and peer comparison. Candidate sources and hashes are retained in this directory.

The sources motivating the constructor and property-layout experiments are
[V8 fast properties](https://v8.dev/blog/fast-properties),
[V8 object spread](https://v8.dev/features/object-rest-spread), and the installed
Valibot object/string implementation. The semantics and measurement results,
rather than a presumed VM fast path, decide whether a candidate is accepted.
