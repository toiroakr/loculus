# Releasing loculus

This follows `toiroakr/politty`'s Changesets / GitHub App / npm trusted publishing
workflow. `toiroakr/lines-db` is also a reference for npm OIDC setup.

Use Node 24 or newer and the pinned pnpm 11.28.5 for development and release tooling.
The published library requires Node 24 or newer; CI tests Node 24 and 26.

## Normal releases

1. Run `pnpm changeset` for a library change and include the file in its PR.
2. After the PR is merged into `main`, `.github/workflows/release.yml` runs the
   typecheck, schema tests, tree-shaking checks, and React Hook Form browser tests.
   Changesets opens or updates `chore: release` with the version and changelog.
3. Review and merge that release PR. The same workflow publishes the unpublished
   version to npm and creates its GitHub release and version tag.

The GitHub App token lets CI run on the generated PR. Checkout does not persist
credentials; Changesets uses its explicit `github-token` input for commits, tags,
and releases. Release runs are serialized without cancelling an active publish.
Manual runs are supported on `main` for retries; forks and other branches cannot
run the release job. Already-published npm versions are skipped by Changesets.

The runtime `loculus` and `@loculus/rolldown` plugin are separate workspace
packages with independent versions. Select only the affected packages when adding
a changeset. Both are public; the plugin requires a compatible Loculus runtime
and Rolldown as peer dependencies. Changes that affect
only development tooling or documentation do not require a changeset.

## One-time GitHub setup

Create a GitHub environment named `release`. Install the release GitHub App on
`toiroakr/loculus` with Contents and Pull requests read/write permissions.
Configure these repository or environment values, matching Politty's names:

| Setting | Kind | Value |
| --- | --- | --- |
| `APP_CLIENT_ID` | Variable | The release GitHub App's client ID |
| `APP_PRIVATE_KEY` | Secret | The release GitHub App's private key |

Enable **Allow GitHub Actions to create and approve pull requests** in repository
Actions settings. The App must be allowed to push its release branch under any
applicable repository rules. Keep CI required on the release PR before merging.

## One-time npm setup

Both packages are public and start at version `0.1.0`. Publish each missing
package interactively before configuring its trusted publisher:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:rhf
npm login
npm publish --access public
npm publish ./packages/rolldown --access public
```

`prepublishOnly` builds the package. Do not enable automated publishing until the
package and trusted publisher are ready. No initial version bump is added by
this workflow setup.

Create the free npm organization `loculus` before publishing `@loculus/rolldown`.
In each package's npm settings, add a GitHub Actions trusted publisher:

| Field | Value |
| --- | --- |
| Organization or user | `toiroakr` |
| Repository | `loculus` |
| Workflow filename | `release.yml` |
| Environment | `release` |
| Allowed action | Direct publishing with `npm publish` |

The workflow uses a GitHub-hosted Ubuntu runner, Node 24, npm 11.11.0,
`id-token: write`, and provenance. `NPM_TOKEN` and `NODE_AUTH_TOKEN` are not
required. Do not add a `registry-url` token placeholder that interferes with OIDC.

The first interactive publication does not create a GitHub release automatically.
Subsequent releases are handled by Changesets.

## Package previews

The `Package preview` job in `ci.yml` publishes both `loculus` and
`@loculus/rolldown` to [pkg.pr.new](https://pkg.pr.new/~/toiroakr/loculus)
after the Node 24/26 checks and React Hook Form tests pass. It runs on branch
pushes and pull requests, excluding tag pushes and workflows in fork repositories.

Install the [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new) on
`toiroakr/loculus` before using previews. The job uses the CLI version pinned in
the lockfile, with no npm token or release environment. The App provides preview
links in PR comments using commit SHAs.

Both packages are published in one invocation with pnpm packing. Preview versions
use `0.0.0-preview-<sha>`, and the plugin's Loculus peer dependency is rewritten
to that preview version. Install both URLs from the preview output together.
These packages do not change npm's published versions or Changesets release state.

## Local verification

```sh
pnpm changeset status
pnpm typecheck
pnpm test
pnpm test:rhf
npm pack --dry-run
npm pack ./packages/rolldown --dry-run
pnpm check:packages
```

Check that each tarball contains its JavaScript, declarations, README, and license. The runtime tarball must contain no
plugin code or Rolldown peer dependency. `pnpm check:packages` installs packed
artifacts and checks the runtime alone and the plugin in an actual Rolldown build.
Benchmarks and examples are excluded by each package's `files` allowlist.

References: [Politty release workflow](https://github.com/toiroakr/politty/blob/main/.github/workflows/release.yml),
[Lines DB release workflow](https://github.com/toiroakr/lines-db/blob/main/.github/workflows/release.yml),
[Changesets action](https://github.com/changesets/action), and
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
