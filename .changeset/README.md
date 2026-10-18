# Changesets

Add a changeset when a change affects `loculus`, `@loculus/rolldown` or `@loculus/infer`:

```sh
pnpm changeset
```

Select the affected packages. They are independently versioned. Before 1.0,
use `patch` for fixes and new compatible features, and `minor` for breaking changes.
Describe the resulting behavior for library users.

Documentation, benchmarks, and workflow-only changes do not need a changeset.
Commit the generated Markdown file with the implementation; do not bump
`package.json` by hand. The release workflow consumes changesets, updates the
versions and changelogs in a release PR, and publishes after that PR is merged.

See [the release guide](../docs/releasing.md) for repository and npm setup.
