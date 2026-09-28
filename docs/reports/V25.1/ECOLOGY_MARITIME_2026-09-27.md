# Resource expansion and illustrative maritime zones

Local World V2 display preparation; supplements SEVEN_LAYERS_2026-09-27.md.
The unchanged terrain and 70-country land partition remain the coordinate source.
No production state, economic seeds, stock/reserve quantities or country assignment
records are changed.

## Ecology

Resources increased from 32 to exactly 320 sites across 16 types. All 70 countries
have 4–6 sites and at least four distinct types. Original resource IDs and locations
remain stable for linked facilities. New sites belong to their declared land region.
Climate uses 14 complete, non-overlapping categories, with per-country area shares.
Both are authored worldbuilding heuristics, not measured climate or reserves.
The overview shows country resource counts; local views show individual sites.
Resource filters distinguish metals, energy, nonmetal minerals and agriculture/forestry.

## Maritime framework

The eighth layer shows maximum 12 nautical mile territorial envelopes, maximum
200 nautical mile EEZ envelopes, high-seas water and overlapping claims. It uses
1 nautical mile = 1.852 km and the existing fictional map width of 36,000 km.
Only each country's ocean-facing coast generates an envelope: 66 coastal states,
four inland states. Enclosed lakes are excluded; horizontal map wrapping is included.

These are undelimited candidate envelopes. Coast pixels substitute for an unsurveyed
low-water baseline. Drawn islands provisionally receive full maritime entitlement;
Article 121 rock qualification is unresolved. No straight/archipelagic baselines or
continental shelf boundaries are inferred. The high-seas label concerns the water,
not seabed rights. Adjacent territorial boundaries require Article 15 median-line
rules and exceptions; EEZ overlap requires equitable delimitation by agreement under
Article 74. Overlaps are hatched, not silently assigned to a country.

Primary references embedded in the UI:

- https://www.un.org/depts/los/convention_agreements/texts/unclos/part2.htm
- https://www.un.org/depts/los/convention_agreements/texts/unclos/part5.htm
- https://www.un.org/depts/los/convention_agreements/texts/unclos/part7.htm
- https://www.un.org/depts/los/convention_agreements/texts/unclos/part8.htm

## Reproduction and validation

Run `tools/enrich_atlas_ecology.py` (also integrated into `build_atlas_layers.py`)
and `tools/build_atlas_maritime.py`; then format generated JSON with Prettier.
Python dependencies are Pillow/numpy/scipy/shapely/scikit-image.
`check_atlas_layers.py` validates land/climate coverage, ownership, country resource
minimums, climate area shares, route and facility integrity. `check_atlas_maritime.py`
checks ocean coverage, disjoint bands, exclusion of inland waters, coastal eligibility
and independently reconstructed distance envelopes. SVG rounding tolerance is 0.008
native pixel (six significant digits), not an allowance for geographic allocation gaps.

Browser inspection confirmed the maritime preset, country-specific highlights,
overlap hatching, resource category filter, local view and country climate/resource
card. TypeScript/build and targeted ESLint passed. Detailed maritime geometry makes
the static local atlas bundle large (8.73 MB / 2.23 MB gzip); Vite's size advisory
remains visible. This is not a production performance acceptance or a deployment.
All checks are implementer checks, not independent approval or gate promotion.

Final exported-geometry checks passed: 66 coastal / 4 inland countries, complete
connected-ocean coverage, inland lakes excluded, and 12/200 nm distance envelopes
within SVG rounding tolerance. Resource/climate checks passed with 320 sites,
16 resource types, 14 climates, 4–6 sites and at least four types in every country.
Original atlas regression suite passed 11/11. Distances are planar at the fictional
map scale; spherical projection/geodesic correction is not available and is stated
in the UI assumptions.
