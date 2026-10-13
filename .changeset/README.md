# Changesets

Add a changeset when a change affects the published `loculus` package:

```sh
pnpm changeset
```

Choose `patch` for fixes, `minor` for new features, and `major` for breaking changes.
Describe the resulting behavior for library users. Both the root API and
`loculus/rolldown` are released together.

Documentation, benchmarks, and workflow-only changes do not need a changeset.
Commit the generated Markdown file with the implementation; do not bump
`package.json` by hand. The release workflow consumes changesets, updates the
version and changelog in a release PR, and publishes after that PR is merged.

See [the release guide](../docs/releasing.md) for repository and npm setup.
