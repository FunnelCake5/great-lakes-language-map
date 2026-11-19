# Data gaps

Items that need a source (`needs_source`) or are disputed (`contested`). Fix them by adding a source to `sources.json` and updating the record.

## Needs source
- event `french-peace-1667`: Iroquois–French peace extends to western allies
- event `licenses-revoked`: French Crown revokes western trade licenses
- event `great-peace`: Great Peace of Montreal
- event `ojibwe-dakota`: Ojibwe push Dakota from Mille Lacs
- event `putnam-1792`: Putnam treaty at Vincennes (never ratified)
- event `removal-act`: Indian Removal Act
- event `black-hawk`: Black Hawk War
- event `trail-of-death`: Potawatomi Trail of Death
- event `miami-removal`: Miami removal from Indiana
- nation `kickapoo` @ 1819: Cede central Illinois
- nation `meskwaki` @ 1804
- nation `potawatomi` @ 1833: Treaty of Chicago
- nation `ojibwe` @ 1750: Push into Dakota country (Mille Lacs)
- nation `miami` @ 1846: Removal
- nation `dhegiha` @ 1673
- nation `dakota` @ 1780: Minnesota River after Ojibwe pressure
- placename `Michigan`
- placename `Minnesota`
- placename `Iowa`

## Contested
- event `dhegiha-exit`: Dhegiha Siouans possibly leave the Ohio Valley
- event `indian-hills`: Indian Hills phase, Maumee Valley: Stothers' Mascouten
- nation `mascouten` @ 1600: Hypothesis A: SW Michigan
- nation `mascouten` @ 1640: Hypothesis A
- nation `mascouten` @ 1600: Hypothesis B: Maumee Valley, Indian Hills phase
- nation `mascouten` @ 1640: Hypothesis B
- nation `kickapoo` @ 1600: Stothers: Whittlesey tradition = Kickapoo
- nation `shawnee` @ 1500: Fort Ancient link debated
- nation `dhegiha` @ 1300: Proposed Ohio Valley homeland

## Weak-source placeholders (Sultzman)
- nation `mascouten`: 6 positions
- nation `mascouten-wabash`: 4 positions
- nation `wea`: 2 positions
- event `allouez-mascouten`: Allouez visits; Mascouten identify as the Assistaeronon

## Chapter placeholders
- chapter `plate-1` (Plate 1): title and years not yet supplied
- chapter `plate-2` (Plate 2): title and years not yet supplied
- chapter `plate-3` (Plate 3): title and years not yet supplied
- chapter `plate-4` (Plate 4): title and years not yet supplied
- chapter `plate-5` (Plate 5): title and years not yet supplied
- chapter `plate-6` (Plate 6): title and years not yet supplied
- chapter `plate-7` (Plate 7): title and years not yet supplied
- chapter `plate-8` (Plate 8): title and years not yet supplied

## Other known gaps
- Maize-line keyframes: no sourced coordinates yet; render as schematic. The two illustrative keyframes in `data/drivers.json` are marked `needs_source`.
- TODO(data): disease layer has no events or sources yet; the toggle shows a placeholder.
- Present-day nations (`data/today.json`): 66 US nations from the 2026 Federal Register list, placed at Census 2024 reservation or tribal-statistical-area points. TODO(data): Canadian First Nations (e.g. Anishinaabe, Potawatomi, Odawa and Haudenosaunee communities in Ontario); the Shawnee Tribe (no Census area of its own); the Ponca Tribe of Nebraska and Kickapoo Traditional Tribe of Texas (outside the map extent); sourced lineage links for name synonyms (Chippewa = Ojibwe, Sac = Sauk, Iowa = Ioway, Sioux = Dakota, Winnebago = Ho-Chunk, Wyandotte = Huron-Wendat); reviewer check of each `language`.
- Population figures per nation over time: not yet sourced.
- Iroquois raid 1682–83 and Fox portage 1660 come only from Sultzman.
- TODO(data): nations hold their last recorded position until 1900 (SPEC interpolation rule). Several tracks end long before then (e.g. `neutral` 1651, `huron` 1701, `menominee` and `haudenosaunee` 1600), so later keyframes or end-of-track records are needed.
