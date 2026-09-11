# Vendored third-party code

Two files, pinned by SHA-256, so the page has **no runtime third-party dependency**.
A page whose whole argument is that it audits itself should not break because someone
else's CDN is having a bad day.

The mapping is declared in an importmap in `index.html`:

```json
{ "imports": {
    "three": "./vendor/three/three.module.min.js",
    "three/addons/": "./vendor/three/"
} }
```

| Path | Upstream | SHA-256 |
|---|---|---|
| `three/three.module.min.js` | `three@0.169.0/build/three.module.min.js` | `f7cee3c7533449a1505cc12cb5128b89e3d4fd3d7ea62b05f9f5464a217472ee` |
| `three/loaders/STLLoader.js` | `three@0.169.0/examples/jsm/loaders/STLLoader.js` | `a0a83c88b269c94e25b690fae770d350c4728c81853195186976be7af0f8a3b3` |

The layout under `three/` mirrors three.js's own addon paths, because the importmap maps the
prefix `three/addons/` onto `./vendor/three/`. So `three/addons/loaders/STLLoader.js` resolves
to `vendor/three/loaders/STLLoader.js` — the `loaders/` directory is not decoration, it is the
resolved path.

`STLLoader.js` imports the bare specifier `'three'`, which the importmap resolves to the
vendored build above — that is why an importmap is needed rather than a plain path rewrite.
Only the STL loader is vendored; the rest of three.js's addons are not used.

Three.js is MIT licensed; its license header is retained verbatim in the minified bundle.

## Verify the pin

```bash
sha256sum vendor/three/three.module.min.js
# f7cee3c7533449a1505cc12cb5128b89e3d4fd3d7ea62b05f9f5464a217472ee
```

Or re-fetch and diff:

```bash
curl -sL https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js \
  | diff - vendor/three/three.module.min.js && echo "identical to upstream"
```
