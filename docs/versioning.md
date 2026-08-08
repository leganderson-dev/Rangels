# Versioning and rollback

Rangels uses semantic versions in project metadata and shorter display versions in the interface.

- Display name: `Rangels V0.6.3`
- Semantic version: `0.6.3`
- Git release tag: `v0.6.3`

## Version policy

- Patch (`0.1.1`): fixes that do not change the intended workflow.
- Minor (`0.2.0`): a meaningful new capability or workflow change.
- Major (`1.0.0`): the first stable release or a later breaking change.
- Every released version receives an annotated Git tag using the full semantic version.
- Version changes must be explicitly reported to the product owner.

## Inspect a release

```sh
git show v0.1.0
```

## Temporarily run an earlier release

This checks out the tagged version without changing or deleting later work:

```sh
git switch --detach v0.1.0
```

Return to current development with:

```sh
git switch main
```

## Restore an earlier release as new work

Create a recovery branch from the known version. This preserves the current branch and all later history:

```sh
git switch -c recovery/v0.1.0 v0.1.0
```

Avoid rewriting shared history. Prefer a recovery branch or a new revert commit so rollback remains reversible.
