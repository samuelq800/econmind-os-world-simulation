# Infrastructure and inland-water expansion

Display-only update to the existing World V2 atlas. Run
`tools/enrich_atlas_hydrology.py` after the base layer/ecology generators, then
format atlas-layers.json. This deterministic enrichment preserves original nodes,
facilities, resources and transport routes.

Infrastructure grows from 35 to 350 locations (20 original nodes + 330 facilities),
exactly five per country. Resource-linked facilities use matching resource types.
Full-map badges show counts; detailed selected-country views isolate its resources
and facilities. New inland-water overlays add 30 lakes and 35 river traces, bringing
the river count to 41. Lakes avoid existing routes, resources and facilities.
Rivers follow land-only paths towards a nearby coast or lake, without a measured
heightfield or hydrological model. The added lakes are proposed water overlays;
the terrain raster, coastal baseline, political jurisdiction and original climate
area accounting remain unchanged. This is worldbuilding, not operational state.

Exported geometry checks PASS: every country has five infrastructure points;
all infrastructure/resources belong to their declared country; proposed lakes
intersect no facilities/resources/routes. Existing land/sea route, climate and
resource checks also pass. TypeScript/build passed; browser inspected natural
geography and selected-country infrastructure. Static bundle size advisory remains.
Shareable HTML and source ZIP were refreshed; ZIP integrity passed. The standalone
file was not browser-tested because file URLs are blocked by the browser tool.
No independent approval, production deployment or gate promotion is claimed.
