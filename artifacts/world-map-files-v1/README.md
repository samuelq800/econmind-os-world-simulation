# World map file package v1

The 203 files listed in `manifest.json` are the immutable, SHA-256-indexed map
and geography source-file inventory on this World V2 Git branch. The inventory
includes all 70 country-scene PNGs, 70 country-detail SVGs, four continent PNGs,
the terrain base image, 15 geography previews, the atlas JSON inputs, and the
versioned geography source package. The files themselves already live at the
manifest paths; they are not duplicated in this directory.

Run `node scripts/verify-world-map-file-package.mjs` to check every file's
bytes and hash. The World web build may serve these versioned presentation
assets. This manifest does **not** make any candidate economic data authoritative,
activate a World, or assert that the balanced country candidate's three drifted
geography snapshots equal the current atlas.
