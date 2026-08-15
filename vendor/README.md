# Vendored runtime UI

`nebula-runtime-ui-0.1.18.tgz` is the immutable package consumed by the Cloud
Web application. It is built from the current `nebula-frontend` working tree,
based on commit `26b85c3562e5c004a790dfad8d28eb7e0f9d3dfa`.

The archive exists because `nebula-frontend` is currently a private GitHub
repository and Bun's Git dependency resolver requires API access to download a
private repository tarball. Keeping the package here makes Cloud builds
reproducible without a sibling checkout or a developer GitHub token.

To update it:

1. Bump `@nebula/runtime-ui` in `nebula-frontend`.
2. Run its tests and production build.
3. Run `bun pm pack --destination /home/jorge/nebula-cloud/vendor`.
4. Update the dependency filename in `apps/web/package.json`.
5. Run `sha256sum vendor/nebula-runtime-ui-*.tgz` and update
   `vendor/SHA256SUMS`.
6. Run `bun install`, the Cloud tests, and the standalone-checkout build.

A future package-registry release should replace this vendored archive.
