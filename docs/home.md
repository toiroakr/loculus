# Documentation homepage

`site/index.html` is the English documentation homepage. Its query playground
runs the current JavaScript runtime, without build-time schema specialization.
The page links to the compatibility comparison and the working React Hook Form
example. Compatibility evidence is regenerated from the current implementation.

Build the library and the linked demo before refreshing the homepage assets:

```sh
pnpm docs:build
```

This requires Node.js, pnpm, and Bun 1.4.3. The build reruns the Node and Bun
compatibility audits, renders their comparison, and builds the standalone form.
`build-home.mjs` checks that the Node and Bun compatibility audits match the
current runtime/plugin source hashes. It refuses to publish stale compatibility
evidence. Raw audit JSON and rendered assets are generated outputs and are not committed.
The audit records acceptance and successful output parity for the
configured peer schemas; it does not prove full error-message compatibility or
all possible input behavior.

Preview and run the desktop/mobile browser checks in separate terminals:

```sh
python3 -m http.server 4193 --bind 127.0.0.1 --directory docs/site
```

```sh
pnpm docs:check
```

The checks cover successful conversion, defaults, rejection, error paths,
clipboard copying, navigation, linked local pages, and viewport overflow.
Reports and screenshots are written to `docs/generated/home-check/`.

## GitHub Pages

The `GitHub Pages` workflow builds and checks the English site on pull requests,
and deploys it after a push to `main` or a manual run on `main`.
The publishing source in repository **Settings → Pages** must be **GitHub Actions**.
The deployment uses the `github-pages` environment and the default `GITHUB_TOKEN`;
no deployment secret is required.

The public URL is <https://toiroakr.github.io/loculus/>. Only `docs/site/` is
uploaded. The workflow tests that same `/loculus/` project path, including runtime
assets, compatibility results, and the standalone form on desktop and mobile.
Pull requests build an artifact but do not deploy it.
