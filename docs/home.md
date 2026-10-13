# Documentation homepage

`site/index.html` is the Japanese documentation homepage. Its query playground
runs the current JavaScript runtime, without build-time schema specialization.
The page links to the compatibility comparison and the working React Hook Form
example. Performance claims deliberately distinguish current behavior from
historical measurements.

Build the library and the linked demo before refreshing the homepage assets:

```sh
pnpm build
node examples/react-hook-form/build.mjs
node docs/build-home.mjs
```

`build-home.mjs` checks that the Node and Bun compatibility audits match the
current runtime/plugin source hashes. It refuses to publish stale compatibility
evidence. The audit records acceptance and successful output parity for the
configured peer schemas; it does not prove full error-message compatibility or
all possible input behavior.

Preview and run the desktop/mobile browser checks in separate terminals:

```sh
python3 -m http.server 4193 --bind 127.0.0.1 --directory docs/site
```

```sh
node docs/check-home.mjs
```

The checks cover successful conversion, defaults, rejection, error paths,
clipboard copying, navigation, linked local pages, and viewport overflow.
Reports and screenshots are written to `docs/generated/home-check/`.

The private hosted preview uses a separate Sites checkout. Its identity and
source credentials are not part of this library repository.
