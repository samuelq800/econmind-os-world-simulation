"""Export the static atlas and reviewable source/data without duplicate scene PNGs."""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs/01a0e1b0-603c-7e13-81de-2cddb9c5d4c1"
PACKAGE = OUTPUT / "World_V2_Atlas_2026-09-28"
SOURCE = ROOT / "apps/world-web/src"
DATA = ROOT / "artifacts/world-geography/reconciled-v2"


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_source(directory, names):
    if directory.endswith("/country-scenes") or directory.endswith("/continent-scenes"):
        return {name for name in names if name.endswith(".png")}
    return set()


def main():
    if PACKAGE.exists():
        shutil.rmtree(PACKAGE)
    (PACKAGE / "site").mkdir(parents=True)
    shutil.copytree(ROOT / "apps/world-web/dist", PACKAGE / "site", dirs_exist_ok=True)
    source_target = PACKAGE / "source/apps/world-web"
    shutil.copytree(SOURCE, source_target / "src", ignore=copy_source)
    for file in ("package.json", "vite.config.ts", "tsconfig.json"):
        candidate = ROOT / "apps/world-web" / file
        if candidate.exists():
            shutil.copy2(candidate, source_target / file)
    (PACKAGE / "source/tools").mkdir(parents=True)
    for tool in ("reconcile_country_presets.py", "build_country_preset_tables.py",
                 "build_country_workbook.mjs", "check_geographic_world.py", "check_country_preset_package.py"):
        shutil.copy2(ROOT / "tools" / tool, PACKAGE / "source/tools" / tool)
    shutil.copytree(DATA, PACKAGE / "data")
    shutil.copy2(OUTPUT / "World_V2_70_Country_Presets_2026-09-28.xlsx", PACKAGE / "data" / "World_V2_70_Country_Presets_2026-09-28.xlsx")
    shutil.copy2(ROOT / "docs/reports/V25.1/COUNTRY_ATLAS_AND_PRESETS_2026-09-28.md", PACKAGE / "data" / "QUALITY_REPORT.md")

    built_pngs = {sha(file): file for file in (PACKAGE / "site/assets").glob("*.png")}
    image_map = {}
    for folder in ("country-scenes", "continent-scenes"):
        for file in (SOURCE / "assets" / folder).glob("*.png"):
            built = built_pngs.get(sha(file))
            if not built:
                raise RuntimeError(f"Missing built asset for {file}")
            image_map[f"assets/{folder}/{file.name}"] = f"site/assets/{built.name}"
    assert len(image_map) == 74
    (PACKAGE / "asset-map.json").write_text(json.dumps(image_map, ensure_ascii=False, indent=2) + "\n")
    (PACKAGE / "restore_scene_assets.py").write_text('''"""Recreate editable scene filenames from the bundled static site."""\nimport json, shutil\nfrom pathlib import Path\nroot=Path(__file__).resolve().parent\nfor original,built in json.loads((root/'asset-map.json').read_text()).items():\n target=root/'source/apps/world-web/src'/original\n target.parent.mkdir(parents=True,exist_ok=True)\n shutil.copy2(root/built,target)\nprint('Restored 74 source scene PNGs')\n''')
    (PACKAGE / "README.md").write_text("""# World V2 可分享地图包\n\n这是 2026-09-28 的虚构地图与情景预设候选；不是正式赛季、已投运设施或真实地理数据。\n\n## 打开交互网页\n\n在 `site` 目录运行 `python3 -m http.server 8000`，访问：\n\n- `http://localhost:8000/?atlas=explorer&country=63`：单个国家的独立图\n- `http://localhost:8000/?atlas=continents`：4 张大陆图\n- `http://localhost:8000/?atlas=coast-boundaries`：原规划图层\n\n请把整个 `site` 文件夹一起分享；单独打开 `index.html` 可能受浏览器本地文件策略限制。\n\n## 数据与源代码\n\n`data/World_V2_70_Country_Presets_2026-09-28.xlsx` 是 70 国可读总表，`data/tables/` 是 CSV，`data/*.json` 是无损主数据。\n`source/apps/world-web/src` 含 TypeScript/CSS/地图元数据，`source/tools` 含复算脚本。为了避免图像重复打包，74 张原名 PNG 可运行根目录 `python3 restore_scene_assets.py` 从已打包网页中还原；对应关系在 `asset-map.json`。这是一份源码摘录，重新构建仍需原仓库依赖及配置。\n\n详细边界见 `data/QUALITY_REPORT.md`。\n""")
    manifest = {"status": "ILLUSTRATIVE_PLANNING_ONLY", "files": len(list(PACKAGE.rglob("*"))),
                "sceneAssets": len(image_map), "siteIndexSha256": sha(PACKAGE / "site/index.html"),
                "workbookSha256": sha(PACKAGE / "data/World_V2_70_Country_Presets_2026-09-28.xlsx")}
    (PACKAGE / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    archive = OUTPUT / f"{PACKAGE.name}.zip"
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as zipped:
        for file in PACKAGE.rglob("*"):
            if file.is_file():
                zipped.write(file, file.relative_to(OUTPUT))
    with zipfile.ZipFile(archive) as zipped:
        assert zipped.testzip() is None
    print(json.dumps({"archive": str(archive), "archiveMB": round(archive.stat().st_size / 1e6, 2),
                      "sceneAssets": len(image_map), "siteIndexSha256": manifest["siteIndexSha256"]}))


if __name__ == "__main__":
    main()
