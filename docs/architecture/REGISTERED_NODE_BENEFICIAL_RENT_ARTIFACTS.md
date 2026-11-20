# Registered Node beneficial-rent artifacts

The optional `beneficialRent` member of `registered-postwar-node-v1` is server deployment data. Existing configurations without it keep their previous startup behavior.

```json
{
  "beneficialRent": {
    "parentSeedPath": "/reviewed-artifacts/parent-seed.json",
    "parentSeedFileSha256": "<64 lowercase hexadecimal characters>",
    "receiptsPath": "/reviewed-artifacts/reclassification-receipts.json",
    "receiptsFileSha256": "<64 lowercase hexadecimal characters>",
    "clockBindingRef": "REVIEWED_EXISTING_CLOCK_BINDING"
  }
}
```

The existing `seedPath` and `seedFileSha256` identify the actual child. Paths are absolute local files. Each seed is capped at 256 MiB; the receipt array is capped at 4 MiB and 70 countries. The loader checks exact shapes, regular files, actual SHA-256 bytes and changes during reading, then reconstructs both seeds through Core. It requires the retained four-source parent family and runs the real beneficial-housing reclassification verifier for the complete receipt set. A historical one-source parent is not a replacement for the operating parent. These checks do not install admission, register a clock, grant a role, or approve a deployment.

There is no configuration field for a prepared token, callback, or readiness boolean. Startup issues one private immutable-data proof and passes the same instance to the shared Social/rent and treasury-FX preparation. The rent controller uses the configured existing worker role and clock-binding reference; their database authority is still checked by the actual runtime.

The loader owns its proof until the rent runtime reserves or accepts it. On failure or shutdown, the service drains the shared owner before closing shared resources. Cleanup refuses to retire a proof still owned by a pending or active rent runtime. Cleanup failure remains an error and does not establish a stopped or ready service. Startup does not start a consumer loop or advance World/Clock.

`registered-node-beneficial-rent-loader.test.ts` uses a tiny, explicitly TEST_ONLY four-source Core fixture. It verifies actual proof reconstruction and rejects hash, shape, scope and receipt mutations. It is a local artifact/ownership regression, not production admission or a replacement for the separate full operating-child verification.
