#!/usr/bin/env python3
"""
Build data/today.json (present-day nations) from two official sources.

  Names:     Federal Register 91(20):4102-4106, 30 Jan 2026, "Indian Entities
             Recognized by and Eligible To Receive Services From the United
             States Bureau of Indian Affairs" (FR Doc. 2026-01899).
  Locations: U.S. Census Bureau, TIGER/Line 2024 AIANNH shapefile
             (tl_2024_us_aiannh.dbf): internal point (INTPTLAT/INTPTLON) of the
             nation's reservation / community / settlement, or of its Oklahoma
             Tribal Statistical Area (OTSA) or Tribal Designated Statistical
             Area (TDSA) where it has no reservation.

Usage:
  curl -O https://www2.census.gov/geo/tiger/TIGER2024/AIANNH/tl_2024_us_aiannh.zip && unzip tl_2024_us_aiannh.zip
  curl -o fr2026.htm https://www.govinfo.gov/content/pkg/FR-2026-01-30/html/2026-01899.htm
  python3 scripts/research/build_today.py tl_2024_us_aiannh.dbf fr2026.htm > data/today.json

Every official name below is checked against the downloaded Federal Register
text, and every coordinate comes from the Census file; nothing is typed in.

Choices a reviewer should check:
  - Area-to-nation matches are by name. Where the Census area name does not
    contain the nation's name (e.g. Isabella Reservation = Saginaw Chippewa),
    confidence is "med" and the note says so.
  - `language` is the heritage language from data/languages.json implied by the
    nation's name; it is not a claim about current fluency.
  - `historic` links are added only where the official name contains a name
    already used in data/nations.json. Synonyms such as Chippewa = Ojibwe,
    Sac = Sauk, Iowa = Ioway, Sioux = Dakota are left for a reviewer to add
    with a source.
"""
import html, json, re, struct, sys

dbf_path, fr_path = sys.argv[1], sys.argv[2]

def read_dbf(path):
    f = open(path, 'rb'); hdr = f.read(32)
    n, hl, rl = struct.unpack('<IHH', hdr[4:12])
    fields = []
    while True:
        d = f.read(32)
        if d[0] == 0x0D: break
        fields.append((d[:11].split(b'\0')[0].decode(), d[16]))
    f.seek(hl); out = []
    for _ in range(n):
        r = f.read(rl); pos = 1; rec = {}
        for name, ln in fields:
            rec[name] = r[pos:pos + ln].decode('latin1').strip(); pos += ln
        out.append(rec)
    return out

areas = read_dbf(dbf_path)
fr_text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', open(fr_path, encoding='utf-8').read())))

# Census LSAD codes: 86 reservation, 82/83/95 community, 9D settlement,
# 88 OTSA, 80 TDSA, OT off-reservation trust land.
KIND = {'86': 'reservation', '82': 'reservation', '83': 'reservation', '95': 'reservation', '9D': 'reservation',
        '88': 'statistical_area', '80': 'statistical_area', 'OT': 'trust_land'}

def area(code, lsad=None):
    cands = [a for a in areas if a['AIANNHCE'] == code and (lsad is None or a['LSAD'] == lsad)]
    # Prefer the reservation proper over off-reservation trust land.
    cands.sort(key=lambda a: a['LSAD'] == 'OT')
    if not cands: raise SystemExit(f'Census area {code}/{lsad} not found')
    return cands[0]

# (id, official name as in the FR list, census AIANNHCE, census LSAD or None,
#  language id, confidence, historic nation ids, note)
MCT = 'Minnesota Chippewa Tribe, Minnesota (Six component reservations:'
ROWS = [
  # Ojibwe (Chippewa)
  ('bad-river', 'Bad River Band of the Lake Superior Tribe of Chippewa Indians of the Bad River Reservation, Wisconsin', '0140', None, 'ojibwe', 'high', [], ''),
  ('bay-mills', 'Bay Mills Indian Community, Michigan', '0170', None, 'ojibwe', 'high', [], 'Language (Ojibwe) assigned during research; the official name does not state it.'),
  ('keweenaw-bay', 'Keweenaw Bay Indian Community, Michigan', '1880', None, 'ojibwe', 'med', [], "The community also holds the Ontonagon Reservation. Match inferred; the Census name does not name the community. Language (Ojibwe) assigned during research; the official name does not state it."),
  ('lac-courte-oreilles', 'Lac Courte Oreilles Band of Lake Superior Chippewa Indians of Wisconsin', '1815', None, 'ojibwe', 'high', [], ''),
  ('lac-du-flambeau', 'Lac du Flambeau Band of Lake Superior Chippewa Indians of the Lac du Flambeau Reservation of Wisconsin', '1825', None, 'ojibwe', 'high', [], ''),
  ('lac-vieux-desert', 'Lac Vieux Desert Band of Lake Superior Chippewa Indians of Michigan', '1830', None, 'ojibwe', 'high', [], ''),
  ('red-cliff', 'Red Cliff Band of Lake Superior Chippewa Indians of Wisconsin', '3085', None, 'ojibwe', 'high', [], ''),
  ('red-lake', 'Red Lake Band of Chippewa Indians, Minnesota', '3100', None, 'ojibwe', 'high', [], ''),
  ('saginaw-chippewa', 'Saginaw Chippewa Indian Tribe of Michigan', '1610', None, 'ojibwe', 'med', [], 'Match inferred; the Census name does not name the tribe.'),
  ('sault-ste-marie', 'Sault Ste. Marie Tribe of Chippewa Indians, Michigan', '3635', None, 'ojibwe', 'high', [], ''),
  ('sokaogon', 'Sokaogon Chippewa Community, Wisconsin', '3885', None, 'ojibwe', 'high', [], ''),
  ('st-croix', 'St. Croix Chippewa Indians of Wisconsin', '3305', None, 'ojibwe', 'high', [], ''),
  ('bois-forte', 'Bois Forte Band (Nett Lake)', '0335', None, 'ojibwe', 'high', [], 'A component band of the Minnesota Chippewa Tribe.'),
  ('fond-du-lac', 'Fond du Lac Band', '1125', None, 'ojibwe', 'high', [], 'A component band of the Minnesota Chippewa Tribe.'),
  ('grand-portage', 'Grand Portage Band', '1355', None, 'ojibwe', 'high', [], 'A component band of the Minnesota Chippewa Tribe.'),
  ('leech-lake', 'Leech Lake Band', '1940', None, 'ojibwe', 'high', [], 'A component band of the Minnesota Chippewa Tribe.'),
  ('mille-lacs', 'Mille Lacs Band', '2270', None, 'ojibwe', 'high', [], 'A component band of the Minnesota Chippewa Tribe.'),
  ('white-earth', 'White Earth Band', '4595', None, 'ojibwe', 'high', [], 'A component band of the Minnesota Chippewa Tribe.'),
  # Odawa (Ottawa)
  ('grand-traverse', 'Grand Traverse Band of Ottawa and Chippewa Indians, Michigan', '1370', None, 'ojibwe', 'high', ['ottawa'], 'Odawa and Ojibwe; language set to Ojibwe, of which Odawa is a dialect in languages.json.'),
  ('little-traverse-bay', 'Little Traverse Bay Bands of Odawa Indians, Michigan', '1963', None, 'ottawa', 'high', ['ottawa'], ''),
  ('little-river', 'Little River Band of Ottawa Indians, Michigan', '1960', None, 'ottawa', 'high', ['ottawa'], ''),
  ('ottawa-ok', 'Ottawa Tribe of Oklahoma', '5770', '88', 'ottawa', 'high', ['ottawa'], ''),
  # Potawatomi
  ('forest-county-potawatomi', 'Forest County Potawatomi Community, Wisconsin', '1135', None, 'potawatomi', 'high', ['potawatomi'], ''),
  ('hannahville', 'Hannahville Indian Community, Michigan', '1410', None, 'potawatomi', 'med', [], 'Language (Potawatomi) assigned during research; the official name does not state it.'),
  ('match-e-be-nash-she-wish', 'Match-E-Be-Nash-She-Wish Band of Pottawatomi', '2150', None, 'potawatomi', 'high', ['potawatomi'], 'Official name uses the spelling "Pottawatomi".'),
  ('nottawaseppi-huron', 'Nottawaseppi Huron Band of the Potawatomi, Michigan', '1550', None, 'potawatomi', 'high', ['potawatomi'], ''),
  ('pokagon', 'Pokagon Band of Potawatomi Indians, Michigan and Indiana', '2890', None, 'potawatomi', 'high', ['potawatomi'], ''),
  ('prairie-band-potawatomi', 'Prairie Band Potawatomi Nation', '2980', None, 'potawatomi', 'high', ['potawatomi'], ''),
  ('citizen-potawatomi', 'Citizen Potawatomi Nation, Oklahoma', '5600', '88', 'potawatomi', 'med', ['potawatomi'], 'OTSA shared with the Absentee-Shawnee Tribe; the point marks the shared area.'),
  # Menominee
  ('menominee', 'Menominee Indian Tribe of Wisconsin', '2175', None, 'menominee', 'high', ['menominee'], ''),
  # Ho-Chunk
  ('ho-chunk', 'Ho-Chunk Nation of Wisconsin', '1450', None, 'hochunk', 'high', ['hochunk'], ''),
  ('winnebago', 'Winnebago Tribe of Nebraska', '4625', None, 'hochunk', 'high', [], ''),
  # Sauk and Meskwaki
  ('sac-fox-mississippi-iowa', 'Sac & Fox Tribe of the Mississippi in Iowa', '3280', None, 'meskwaki', 'high', ['meskwaki'], ''),
  ('sac-fox-missouri', 'Sac & Fox Nation of Missouri in Kansas and Nebraska', '3285', None, 'sauk', 'med', ['meskwaki'], 'Match inferred from the Kansas–Nebraska reservation name. Language (Sauk) assigned during research.'),
  ('sac-fox-oklahoma', 'Sac & Fox Nation, Oklahoma', '5820', '88', 'sauk', 'high', ['meskwaki'], 'Language (Sauk) assigned during research.'),
  # Kickapoo
  ('kickapoo-kansas', 'Kickapoo Tribe of Indians of the Kickapoo Reservation in Kansas', '1770', None, 'kickapoo', 'high', ['kickapoo'], ''),
  ('kickapoo-oklahoma', 'Kickapoo Tribe of Oklahoma', '5700', '88', 'kickapoo', 'high', ['kickapoo'], ''),
  # Miami-Illinois
  ('miami-oklahoma', 'Miami Tribe of Oklahoma', '5730', '88', 'mi-miami', 'high', ['miami'], ''),
  ('peoria', 'Peoria Tribe of Indians of Oklahoma', '5795', '88', 'miami-illinois', 'high', ['illinois'], 'Linked to the Illinois Confederacy, whose name in nations.json includes Peoria.'),
  # Shawnee
  ('eastern-shawnee', 'Eastern Shawnee Tribe of Oklahoma', '5640', '88', 'shawnee', 'high', ['shawnee'], ''),
  ('absentee-shawnee', 'Absentee-Shawnee Tribe of Indians of Oklahoma', '5600', '88', 'shawnee', 'med', ['shawnee'], 'OTSA shared with the Citizen Potawatomi Nation; the point marks the shared area.'),
  # Chiwere
  ('iowa-kansas-nebraska', 'Iowa Tribe of Kansas and Nebraska', '1590', None, 'chiwere', 'high', [], ''),
  ('iowa-oklahoma', 'Iowa Tribe of Oklahoma', '5670', '88', 'chiwere', 'high', [], ''),
  ('otoe-missouria', 'Otoe-Missouria Tribe of Indians, Oklahoma', '5760', '88', 'chiwere', 'high', ['chiwere'], ''),
  # Dhegiha
  ('omaha', 'Omaha Tribe of Nebraska', '2550', None, 'omaha-ponca', 'high', ['dhegiha'], ''),
  ('ponca-oklahoma', 'Ponca Tribe of Indians of Oklahoma', '5800', '88', 'omaha-ponca', 'high', [], ''),
  ('osage', 'The Osage Nation', '2595', None, 'osage-kansa', 'high', ['dhegiha'], ''),
  ('kaw', 'Kaw Nation, Oklahoma', '5690', '88', 'osage-kansa', 'high', [], ''),
  ('quapaw', 'Quapaw Nation', '5810', '88', 'quapaw', 'high', ['dhegiha'], ''),
  # Dakota
  ('lower-sioux', 'Lower Sioux Indian Community in the State of Minnesota', '2055', None, 'dakota', 'high', [], ''),
  ('upper-sioux', 'Upper Sioux Community, Minnesota', '4445', None, 'dakota', 'high', [], ''),
  ('prairie-island', 'Prairie Island Indian Community in the State of Minnesota', '2985', None, 'dakota', 'high', [], ''),
  ('shakopee-mdewakanton', 'Shakopee Mdewakanton Sioux Community of Minnesota', '3680', None, 'dakota', 'high', [], ''),
  ('santee-sioux', 'Santee Sioux Nation, Nebraska', '3565', None, 'dakota', 'high', [], ''),
  ('flandreau-santee', 'Flandreau Santee Sioux Tribe of South Dakota', '1100', None, 'dakota', 'high', [], ''),
  ('sisseton-wahpeton', 'Sisseton-Wahpeton Oyate of the Lake Traverse Reservation, South Dakota', '1860', None, 'dakota', 'high', [], ''),
  # Iroquoian (context)
  ('wyandotte', 'Wyandotte Nation', '5890', '88', 'huron', 'high', [], 'Language (Huron-Wendat) assigned during research.'),
  ('seneca-nation', 'Seneca Nation of Indians', '0080', None, 'haudenosaunee', 'med', [], 'The Nation also holds the Cattaraugus and Oil Springs reservations. Match inferred; the Census name does not name the Nation.'),
  ('tonawanda-seneca', 'Tonawanda Band of Seneca', '4225', None, 'haudenosaunee', 'high', [], ''),
  ('oneida-indian-nation', 'Oneida Indian Nation', '2555', None, 'haudenosaunee', 'high', [], ''),
  ('oneida-nation-wisconsin', 'Oneida Nation', '2560', None, 'haudenosaunee', 'high', [], ''),
  ('onondaga', 'Onondaga Nation', '2570', None, 'haudenosaunee', 'high', [], ''),
  ('cayuga', 'Cayuga Nation', '8100', '80', 'haudenosaunee', 'high', [], ''),
  ('tuscarora', 'Tuscarora Nation', '4360', None, 'iroquoian', 'high', [], 'Tuscarora is an Iroquoian language outside the Five Nations branch in languages.json, so the family is used.'),
  ('st-regis-mohawk', 'Saint Regis Mohawk Tribe', '3320', None, 'haudenosaunee', 'high', [], ''),
  ('seneca-cayuga', 'Seneca-Cayuga Nation', '5835', '88', 'haudenosaunee', 'high', [], ''),
]

out = []
for (id_, name, code, lsad, language, conf, historic, note) in ROWS:
    check = name if id_ not in ('bois-forte', 'fond-du-lac', 'grand-portage', 'leech-lake', 'mille-lacs', 'white-earth') else name.split(' (')[0]
    if check not in fr_text:
        raise SystemExit(f'Official name not found in the Federal Register text: {name!r}')
    if id_ in ('bois-forte', 'fond-du-lac', 'grand-portage', 'leech-lake', 'mille-lacs', 'white-earth') and MCT not in fr_text:
        raise SystemExit('Minnesota Chippewa Tribe entry not found')
    a = area(code, lsad)
    lat, lon = round(float(a['INTPTLAT']), 3), round(float(a['INTPTLON']), 3)
    if not (33 <= lat <= 50 and -98 <= lon <= -72):
        raise SystemExit(f'{id_}: Census point {lat},{lon} outside the map extent')
    rec = {
        'id': id_, 'name': name, 'language': language,
        **({'historic': historic} if historic else {}),
        'kind': KIND.get(a['LSAD']) or sys.exit(f"{id_}: unhandled Census LSAD {a['LSAD']}"), 'lat': lat, 'lon': lon,
        'confidence': conf, 'source': 'census_tiger2024_aiannh', 'name_source': 'fr2026_tribes',
        'note': ' '.join(x for x in [f"Point: Census {a['NAMELSAD']}.", note] if x),
    }
    out.append(rec)

json.dump({
    'note': 'Present-day nations for the Today view. Names: Federal Register list of 30 Jan 2026 (fr2026_tribes). Points: Census TIGER/Line 2024 internal points of each nation’s reservation or tribal statistical area (census_tiger2024_aiannh). Each `language` is the heritage language from languages.json assigned during research, not taken from these sources; reviewers should confirm. US nations inside the map extent only; Canadian First Nations not yet included. Built by scripts/research/build_today.py.',
    'nations': out,
}, sys.stdout, indent=1, ensure_ascii=False)
print()
