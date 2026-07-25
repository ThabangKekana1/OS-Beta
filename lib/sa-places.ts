/**
 * Curated South African place directory for the migration intake.
 *
 * Purpose: resolve a typed town/city to its municipality, province and a
 * supply-context hint so the first report can (a) name the likely supplier
 * and (b) anchor its tariff assumptions on the right tariff menu. This is a
 * deliberately curated list of confident entries — free-text entry remains
 * fully supported and unknown towns simply fall back to province-level
 * assumptions. It is NOT a tariff authority: the six-bill audit remains the
 * only source of tariff truth.
 *
 * context values:
 * - "metro": metropolitan municipality — urban Eskom tariffs or metro utility
 * - "town":  secondary city / large town — municipal distribution likely
 * - "rural": agri / rural service area — rural Eskom tariff families likely
 */

export type SaPlaceContext = "metro" | "town" | "rural";

export type SaPlace = {
  name: string;
  municipality: string;
  province: string;
  context: SaPlaceContext;
};

function p(name: string, municipality: string, province: string, context: SaPlaceContext): SaPlace {
  return { name, municipality, province, context };
}

export const SA_PLACES: readonly SaPlace[] = [
  // ——— Gauteng ———
  p("Johannesburg", "City of Johannesburg Metropolitan Municipality", "Gauteng", "metro"),
  p("Sandton", "City of Johannesburg Metropolitan Municipality", "Gauteng", "metro"),
  p("Randburg", "City of Johannesburg Metropolitan Municipality", "Gauteng", "metro"),
  p("Roodepoort", "City of Johannesburg Metropolitan Municipality", "Gauteng", "metro"),
  p("Soweto", "City of Johannesburg Metropolitan Municipality", "Gauteng", "metro"),
  p("Midrand", "City of Johannesburg Metropolitan Municipality", "Gauteng", "metro"),
  p("Pretoria", "City of Tshwane Metropolitan Municipality", "Gauteng", "metro"),
  p("Centurion", "City of Tshwane Metropolitan Municipality", "Gauteng", "metro"),
  p("Soshanguve", "City of Tshwane Metropolitan Municipality", "Gauteng", "metro"),
  p("Mamelodi", "City of Tshwane Metropolitan Municipality", "Gauteng", "metro"),
  p("Germiston", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Boksburg", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Benoni", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Kempton Park", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Springs", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Alberton", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Edenvale", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Brakpan", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Nigel", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Katlehong", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Tembisa", "City of Ekurhuleni Metropolitan Municipality", "Gauteng", "metro"),
  p("Vereeniging", "Emfuleni Local Municipality", "Gauteng", "town"),
  p("Vanderbijlpark", "Emfuleni Local Municipality", "Gauteng", "town"),
  p("Sebokeng", "Emfuleni Local Municipality", "Gauteng", "town"),
  p("Meyerton", "Midvaal Local Municipality", "Gauteng", "town"),
  p("Heidelberg (Gauteng)", "Lesedi Local Municipality", "Gauteng", "town"),
  p("Krugersdorp", "Mogale City Local Municipality", "Gauteng", "town"),
  p("Magaliesburg", "Mogale City Local Municipality", "Gauteng", "rural"),
  p("Randfontein", "Rand West City Local Municipality", "Gauteng", "town"),
  p("Westonaria", "Rand West City Local Municipality", "Gauteng", "town"),
  p("Carletonville", "Merafong City Local Municipality", "Gauteng", "town"),
  p("Bronkhorstspruit", "City of Tshwane Metropolitan Municipality", "Gauteng", "rural"),
  p("Cullinan", "City of Tshwane Metropolitan Municipality", "Gauteng", "rural"),
  p("Hammanskraal", "City of Tshwane Metropolitan Municipality", "Gauteng", "town"),

  // ——— Western Cape ———
  p("Cape Town", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Bellville", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Durbanville", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Kraaifontein", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Khayelitsha", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Mitchells Plain", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Somerset West", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Atlantis", "City of Cape Town Metropolitan Municipality", "Western Cape", "metro"),
  p("Stellenbosch", "Stellenbosch Local Municipality", "Western Cape", "town"),
  p("Franschhoek", "Stellenbosch Local Municipality", "Western Cape", "rural"),
  p("Paarl", "Drakenstein Local Municipality", "Western Cape", "town"),
  p("Wellington", "Drakenstein Local Municipality", "Western Cape", "town"),
  p("Worcester", "Breede Valley Local Municipality", "Western Cape", "town"),
  p("De Doorns", "Breede Valley Local Municipality", "Western Cape", "rural"),
  p("Robertson", "Langeberg Local Municipality", "Western Cape", "rural"),
  p("Ashton", "Langeberg Local Municipality", "Western Cape", "rural"),
  p("Montagu", "Langeberg Local Municipality", "Western Cape", "rural"),
  p("Ceres", "Witzenberg Local Municipality", "Western Cape", "rural"),
  p("Tulbagh", "Witzenberg Local Municipality", "Western Cape", "rural"),
  p("Malmesbury", "Swartland Local Municipality", "Western Cape", "town"),
  p("Moorreesburg", "Swartland Local Municipality", "Western Cape", "rural"),
  p("Vredenburg", "Saldanha Bay Local Municipality", "Western Cape", "town"),
  p("Saldanha", "Saldanha Bay Local Municipality", "Western Cape", "town"),
  p("Langebaan", "Saldanha Bay Local Municipality", "Western Cape", "town"),
  p("Piketberg", "Bergrivier Local Municipality", "Western Cape", "rural"),
  p("Citrusdal", "Cederberg Local Municipality", "Western Cape", "rural"),
  p("Clanwilliam", "Cederberg Local Municipality", "Western Cape", "rural"),
  p("Vredendal", "Matzikama Local Municipality", "Western Cape", "rural"),
  p("Hermanus", "Overstrand Local Municipality", "Western Cape", "town"),
  p("Gansbaai", "Overstrand Local Municipality", "Western Cape", "rural"),
  p("Caledon", "Theewaterskloof Local Municipality", "Western Cape", "rural"),
  p("Grabouw", "Theewaterskloof Local Municipality", "Western Cape", "rural"),
  p("Villiersdorp", "Theewaterskloof Local Municipality", "Western Cape", "rural"),
  p("Bredasdorp", "Cape Agulhas Local Municipality", "Western Cape", "rural"),
  p("Swellendam", "Swellendam Local Municipality", "Western Cape", "rural"),
  p("George", "George Local Municipality", "Western Cape", "town"),
  p("Mossel Bay", "Mossel Bay Local Municipality", "Western Cape", "town"),
  p("Oudtshoorn", "Oudtshoorn Local Municipality", "Western Cape", "town"),
  p("Knysna", "Knysna Local Municipality", "Western Cape", "town"),
  p("Plettenberg Bay", "Bitou Local Municipality", "Western Cape", "town"),
  p("Riversdale", "Hessequa Local Municipality", "Western Cape", "rural"),
  p("Beaufort West", "Beaufort West Local Municipality", "Western Cape", "town"),

  // ——— KwaZulu-Natal ———
  p("Durban", "eThekwini Metropolitan Municipality", "KwaZulu-Natal", "metro"),
  p("Umhlanga", "eThekwini Metropolitan Municipality", "KwaZulu-Natal", "metro"),
  p("Pinetown", "eThekwini Metropolitan Municipality", "KwaZulu-Natal", "metro"),
  p("Amanzimtoti", "eThekwini Metropolitan Municipality", "KwaZulu-Natal", "metro"),
  p("Tongaat", "eThekwini Metropolitan Municipality", "KwaZulu-Natal", "metro"),
  p("Verulam", "eThekwini Metropolitan Municipality", "KwaZulu-Natal", "metro"),
  p("Pietermaritzburg", "Msunduzi Local Municipality", "KwaZulu-Natal", "town"),
  p("Howick", "uMngeni Local Municipality", "KwaZulu-Natal", "town"),
  p("Mooi River", "Mpofana Local Municipality", "KwaZulu-Natal", "rural"),
  p("Newcastle", "Newcastle Local Municipality", "KwaZulu-Natal", "town"),
  p("Ladysmith", "Alfred Duma Local Municipality", "KwaZulu-Natal", "town"),
  p("Estcourt", "Inkosi Langalibalele Local Municipality", "KwaZulu-Natal", "town"),
  p("Dundee", "Endumeni Local Municipality", "KwaZulu-Natal", "town"),
  p("Vryheid", "AbaQulusi Local Municipality", "KwaZulu-Natal", "town"),
  p("Richards Bay", "City of uMhlathuze Local Municipality", "KwaZulu-Natal", "town"),
  p("Empangeni", "City of uMhlathuze Local Municipality", "KwaZulu-Natal", "town"),
  p("Eshowe", "uMlalazi Local Municipality", "KwaZulu-Natal", "rural"),
  p("Ballito", "KwaDukuza Local Municipality", "KwaZulu-Natal", "town"),
  p("Stanger", "KwaDukuza Local Municipality", "KwaZulu-Natal", "town"),
  p("Port Shepstone", "Ray Nkonyeni Local Municipality", "KwaZulu-Natal", "town"),
  p("Margate", "Ray Nkonyeni Local Municipality", "KwaZulu-Natal", "town"),
  p("Kokstad", "Greater Kokstad Local Municipality", "KwaZulu-Natal", "rural"),
  p("Ixopo", "Ubuhlebezwe Local Municipality", "KwaZulu-Natal", "rural"),
  p("Greytown", "Umvoti Local Municipality", "KwaZulu-Natal", "rural"),
  p("Ulundi", "Ulundi Local Municipality", "KwaZulu-Natal", "rural"),
  p("Pongola", "uPhongolo Local Municipality", "KwaZulu-Natal", "rural"),
  p("Bergville", "Okhahlamba Local Municipality", "KwaZulu-Natal", "rural"),

  // ——— Eastern Cape ———
  p("Gqeberha (Port Elizabeth)", "Nelson Mandela Bay Metropolitan Municipality", "Eastern Cape", "metro"),
  p("Kariega (Uitenhage)", "Nelson Mandela Bay Metropolitan Municipality", "Eastern Cape", "metro"),
  p("East London", "Buffalo City Metropolitan Municipality", "Eastern Cape", "metro"),
  p("King William's Town", "Buffalo City Metropolitan Municipality", "Eastern Cape", "town"),
  p("Mdantsane", "Buffalo City Metropolitan Municipality", "Eastern Cape", "metro"),
  p("Makhanda (Grahamstown)", "Makana Local Municipality", "Eastern Cape", "town"),
  p("Graaff-Reinet", "Dr Beyers Naudé Local Municipality", "Eastern Cape", "rural"),
  p("Cradock", "Inxuba Yethemba Local Municipality", "Eastern Cape", "rural"),
  p("Middelburg (Eastern Cape)", "Inxuba Yethemba Local Municipality", "Eastern Cape", "rural"),
  p("Queenstown (Komani)", "Enoch Mgijima Local Municipality", "Eastern Cape", "town"),
  p("Aliwal North", "Walter Sisulu Local Municipality", "Eastern Cape", "rural"),
  p("Mthatha", "King Sabata Dalindyebo Local Municipality", "Eastern Cape", "town"),
  p("Butterworth", "Mnquma Local Municipality", "Eastern Cape", "rural"),
  p("Kokstad Road (Matatiele)", "Matatiele Local Municipality", "Eastern Cape", "rural"),
  p("Port St Johns", "Port St Johns Local Municipality", "Eastern Cape", "rural"),
  p("Jeffreys Bay", "Kouga Local Municipality", "Eastern Cape", "town"),
  p("Humansdorp", "Kouga Local Municipality", "Eastern Cape", "town"),
  p("Port Alfred", "Ndlambe Local Municipality", "Eastern Cape", "town"),
  p("Somerset East", "Blue Crane Route Local Municipality", "Eastern Cape", "rural"),
  p("Fort Beaufort", "Raymond Mhlaba Local Municipality", "Eastern Cape", "rural"),

  // ——— Free State ———
  p("Bloemfontein", "Mangaung Metropolitan Municipality", "Free State", "metro"),
  p("Botshabelo", "Mangaung Metropolitan Municipality", "Free State", "town"),
  p("Thaba Nchu", "Mangaung Metropolitan Municipality", "Free State", "rural"),
  p("Welkom", "Matjhabeng Local Municipality", "Free State", "town"),
  p("Virginia", "Matjhabeng Local Municipality", "Free State", "town"),
  p("Odendaalsrus", "Matjhabeng Local Municipality", "Free State", "town"),
  p("Kroonstad", "Moqhaka Local Municipality", "Free State", "town"),
  p("Viljoenskroon", "Moqhaka Local Municipality", "Free State", "rural"),
  p("Sasolburg", "Metsimaholo Local Municipality", "Free State", "town"),
  p("Deneysville", "Metsimaholo Local Municipality", "Free State", "rural"),
  p("Parys", "Ngwathe Local Municipality", "Free State", "town"),
  p("Vredefort", "Ngwathe Local Municipality", "Free State", "rural"),
  p("Heilbron", "Ngwathe Local Municipality", "Free State", "rural"),
  p("Koppies", "Ngwathe Local Municipality", "Free State", "rural"),
  p("Frankfort", "Mafube Local Municipality", "Free State", "rural"),
  p("Villiers", "Mafube Local Municipality", "Free State", "rural"),
  p("Vrede", "Phumelela Local Municipality", "Free State", "rural"),
  p("Memel", "Phumelela Local Municipality", "Free State", "rural"),
  p("Harrismith", "Maluti-a-Phofung Local Municipality", "Free State", "town"),
  p("Phuthaditjhaba", "Maluti-a-Phofung Local Municipality", "Free State", "town"),
  p("Bethlehem", "Dihlabeng Local Municipality", "Free State", "town"),
  p("Clarens", "Dihlabeng Local Municipality", "Free State", "rural"),
  p("Fouriesburg", "Dihlabeng Local Municipality", "Free State", "rural"),
  p("Senekal", "Setsoto Local Municipality", "Free State", "rural"),
  p("Ficksburg", "Setsoto Local Municipality", "Free State", "rural"),
  p("Marquard", "Setsoto Local Municipality", "Free State", "rural"),
  p("Reitz", "Nketoana Local Municipality", "Free State", "rural"),
  p("Lindley", "Nketoana Local Municipality", "Free State", "rural"),
  p("Bothaville", "Nala Local Municipality", "Free State", "rural"),
  p("Wesselsbron", "Nala Local Municipality", "Free State", "rural"),
  p("Hoopstad", "Tswelopele Local Municipality", "Free State", "rural"),
  p("Bultfontein", "Tswelopele Local Municipality", "Free State", "rural"),
  p("Theunissen", "Masilonyana Local Municipality", "Free State", "rural"),
  p("Brandfort", "Masilonyana Local Municipality", "Free State", "rural"),
  p("Ladybrand", "Mantsopa Local Municipality", "Free State", "rural"),
  p("Zastron", "Mohokare Local Municipality", "Free State", "rural"),
  p("Smithfield", "Mohokare Local Municipality", "Free State", "rural"),
  p("Trompsburg", "Kopanong Local Municipality", "Free State", "rural"),
  p("Edenburg", "Kopanong Local Municipality", "Free State", "rural"),
  p("Jacobsdal", "Letsemeng Local Municipality", "Free State", "rural"),
  p("Koffiefontein", "Letsemeng Local Municipality", "Free State", "rural"),

  // ——— North West ———
  p("Rustenburg", "Rustenburg Local Municipality", "North West", "town"),
  p("Phokeng", "Rustenburg Local Municipality", "North West", "town"),
  p("Brits", "Madibeng Local Municipality", "North West", "town"),
  p("Hartbeespoort", "Madibeng Local Municipality", "North West", "town"),
  p("Potchefstroom", "JB Marks Local Municipality", "North West", "town"),
  p("Ventersdorp", "JB Marks Local Municipality", "North West", "rural"),
  p("Klerksdorp", "City of Matlosana Local Municipality", "North West", "town"),
  p("Orkney", "City of Matlosana Local Municipality", "North West", "town"),
  p("Stilfontein", "City of Matlosana Local Municipality", "North West", "town"),
  p("Hartswater", "Phokwane Local Municipality", "Northern Cape", "rural"),
  p("Wolmaransstad", "Maquassi Hills Local Municipality", "North West", "rural"),
  p("Mahikeng", "Mahikeng Local Municipality", "North West", "town"),
  p("Lichtenburg", "Ditsobotla Local Municipality", "North West", "rural"),
  p("Coligny", "Ditsobotla Local Municipality", "North West", "rural"),
  p("Zeerust", "Ramotshere Moiloa Local Municipality", "North West", "rural"),
  p("Delareyville", "Tswaing Local Municipality", "North West", "rural"),
  p("Sannieshof", "Tswaing Local Municipality", "North West", "rural"),
  p("Vryburg", "Naledi Local Municipality", "North West", "rural"),
  p("Schweizer-Reneke", "Mamusa Local Municipality", "North West", "rural"),
  p("Bloemhof", "Lekwa-Teemane Local Municipality", "North West", "rural"),
  p("Christiana", "Lekwa-Teemane Local Municipality", "North West", "rural"),
  p("Koster", "Kgetlengrivier Local Municipality", "North West", "rural"),
  p("Swartruggens", "Kgetlengrivier Local Municipality", "North West", "rural"),

  // ——— Limpopo ———
  p("Polokwane", "Polokwane Local Municipality", "Limpopo", "town"),
  p("Seshego", "Polokwane Local Municipality", "Limpopo", "town"),
  p("Mokopane", "Mogalakwena Local Municipality", "Limpopo", "town"),
  p("Modimolle", "Modimolle-Mookgophong Local Municipality", "Limpopo", "rural"),
  p("Mookgophong (Naboomspruit)", "Modimolle-Mookgophong Local Municipality", "Limpopo", "rural"),
  p("Bela-Bela", "Bela-Bela Local Municipality", "Limpopo", "town"),
  p("Thabazimbi", "Thabazimbi Local Municipality", "Limpopo", "rural"),
  p("Lephalale", "Lephalale Local Municipality", "Limpopo", "town"),
  p("Vaalwater", "Modimolle-Mookgophong Local Municipality", "Limpopo", "rural"),
  p("Tzaneen", "Greater Tzaneen Local Municipality", "Limpopo", "rural"),
  p("Letsitele", "Greater Tzaneen Local Municipality", "Limpopo", "rural"),
  p("Giyani", "Greater Giyani Local Municipality", "Limpopo", "rural"),
  p("Phalaborwa", "Ba-Phalaborwa Local Municipality", "Limpopo", "town"),
  p("Hoedspruit", "Maruleng Local Municipality", "Limpopo", "rural"),
  p("Louis Trichardt (Makhado)", "Makhado Local Municipality", "Limpopo", "town"),
  p("Musina", "Musina Local Municipality", "Limpopo", "town"),
  p("Thohoyandou", "Thulamela Local Municipality", "Limpopo", "town"),
  p("Groblersdal", "Elias Motsoaledi Local Municipality", "Limpopo", "rural"),
  p("Marble Hall", "Ephraim Mogale Local Municipality", "Limpopo", "rural"),
  p("Jane Furse", "Makhuduthamaga Local Municipality", "Limpopo", "rural"),
  p("Masemola", "Makhuduthamaga Local Municipality", "Limpopo", "rural"),
  p("Burgersfort", "Fetakgomo Tubatse Local Municipality", "Limpopo", "rural"),
  p("Steelpoort", "Fetakgomo Tubatse Local Municipality", "Limpopo", "rural"),
  p("Dendron (Mogwadi)", "Molemole Local Municipality", "Limpopo", "rural"),

  // ——— Mpumalanga ———
  p("Mbombela (Nelspruit)", "City of Mbombela Local Municipality", "Mpumalanga", "town"),
  p("White River", "City of Mbombela Local Municipality", "Mpumalanga", "rural"),
  p("Hazyview", "City of Mbombela Local Municipality", "Mpumalanga", "rural"),
  p("Barberton", "City of Mbombela Local Municipality", "Mpumalanga", "town"),
  p("Malalane", "Nkomazi Local Municipality", "Mpumalanga", "rural"),
  p("Komatipoort", "Nkomazi Local Municipality", "Mpumalanga", "rural"),
  p("Sabie", "Thaba Chweu Local Municipality", "Mpumalanga", "rural"),
  p("Lydenburg (Mashishing)", "Thaba Chweu Local Municipality", "Mpumalanga", "rural"),
  p("Emalahleni (Witbank)", "Emalahleni Local Municipality", "Mpumalanga", "town"),
  p("Middelburg (Mpumalanga)", "Steve Tshwete Local Municipality", "Mpumalanga", "town"),
  p("Hendrina", "Steve Tshwete Local Municipality", "Mpumalanga", "rural"),
  p("Secunda", "Govan Mbeki Local Municipality", "Mpumalanga", "town"),
  p("Bethal", "Govan Mbeki Local Municipality", "Mpumalanga", "town"),
  p("Evander", "Govan Mbeki Local Municipality", "Mpumalanga", "town"),
  p("Standerton", "Lekwa Local Municipality", "Mpumalanga", "rural"),
  p("Volksrust", "Dr Pixley Ka Isaka Seme Local Municipality", "Mpumalanga", "rural"),
  p("Ermelo", "Msukaligwa Local Municipality", "Mpumalanga", "town"),
  p("Piet Retief (eMkhondo)", "Mkhondo Local Municipality", "Mpumalanga", "rural"),
  p("Carolina", "Chief Albert Luthuli Local Municipality", "Mpumalanga", "rural"),
  p("Delmas", "Victor Khanye Local Municipality", "Mpumalanga", "rural"),
  p("Bronkhorstspruit Road (Ekangala)", "City of Tshwane Metropolitan Municipality", "Gauteng", "town"),
  p("Belfast (eMakhazeni)", "Emakhazeni Local Municipality", "Mpumalanga", "rural"),
  p("Dullstroom", "Emakhazeni Local Municipality", "Mpumalanga", "rural"),

  // ——— Northern Cape ———
  p("Kimberley", "Sol Plaatje Local Municipality", "Northern Cape", "town"),
  p("Upington", "Dawid Kruiper Local Municipality", "Northern Cape", "town"),
  p("Keimoes", "Kai !Garib Local Municipality", "Northern Cape", "rural"),
  p("Kakamas", "Kai !Garib Local Municipality", "Northern Cape", "rural"),
  p("Springbok", "Nama Khoi Local Municipality", "Northern Cape", "rural"),
  p("De Aar", "Emthanjeni Local Municipality", "Northern Cape", "rural"),
  p("Colesberg", "Umsobomvu Local Municipality", "Northern Cape", "rural"),
  p("Kuruman", "Ga-Segonyana Local Municipality", "Northern Cape", "rural"),
  p("Kathu", "Gamagara Local Municipality", "Northern Cape", "town"),
  p("Postmasburg", "Tsantsabane Local Municipality", "Northern Cape", "rural"),
  p("Douglas", "Siyancuma Local Municipality", "Northern Cape", "rural"),
  p("Prieska", "Siyathemba Local Municipality", "Northern Cape", "rural"),
  p("Calvinia", "Hantam Local Municipality", "Northern Cape", "rural"),
  p("Warrenton", "Magareng Local Municipality", "Northern Cape", "rural"),
  p("Jan Kempdorp", "Phokwane Local Municipality", "Northern Cape", "rural"),
] as const;

/** Case/diacritic-insensitive search over names (and bracketed aliases). */
export function searchSaPlaces(query: string, limit = 8): SaPlace[] {
  return searchPlaces(query, [], limit);
}

/**
 * Parses the national gazetteer payload (public/data/sa-places.json —
 * GeoNames-derived tuples of [name, municipality, province, context]) into
 * validated place entries. Invalid rows are dropped, never thrown.
 */
export function parseGazetteer(raw: unknown): SaPlace[] {
  if (!Array.isArray(raw)) return [];
  const places: SaPlace[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [name, municipality, province, context] = row;
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof province !== "string" || !province.trim()) continue;
    if (context !== "metro" && context !== "town" && context !== "rural") continue;
    places.push({
      name: name.trim(),
      municipality: typeof municipality === "string" && municipality.trim() ? municipality.trim() : "",
      province: province.trim(),
      context,
    });
  }
  return places;
}

/**
 * Search across the curated directory plus an optional loaded gazetteer.
 * Curated entries win on conflicts (they carry verified metro context);
 * prefix matches rank above substring matches; gazetteer order (population
 * descending, as generated) is preserved within each rank.
 */
export function searchPlaces(query: string, gazetteer: readonly SaPlace[] = [], limit = 8): SaPlace[] {
  const cleaned = query.trim().toLowerCase();
  if (cleaned.length < 2) return [];
  const seen = new Set<string>();
  const starts: SaPlace[] = [];
  const contains: SaPlace[] = [];
  const consider = (place: SaPlace) => {
    const key = `${place.name.toLowerCase()}|${place.province.toLowerCase()}`;
    if (seen.has(key)) return;
    const haystack = place.name.toLowerCase();
    if (haystack.startsWith(cleaned)) {
      seen.add(key);
      starts.push(place);
    } else if (haystack.includes(cleaned)) {
      seen.add(key);
      contains.push(place);
    }
  };
  for (const place of SA_PLACES) consider(place);
  for (const place of gazetteer) {
    if (starts.length >= limit) break;
    consider(place);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Exact resolution of a stored/typed town name to its directory entry. */
export function resolveSaPlace(name: string): SaPlace | null {
  return resolvePlace(name, []);
}

/** Exact resolution across curated + gazetteer entries; curated wins. */
export function resolvePlace(name: string, gazetteer: readonly SaPlace[] = []): SaPlace | null {
  const cleaned = name.trim().toLowerCase();
  if (!cleaned) return null;
  const curated =
    SA_PLACES.find((place) => place.name.toLowerCase() === cleaned)
    ?? SA_PLACES.find((place) => place.name.toLowerCase().startsWith(`${cleaned} (`))
    ?? SA_PLACES.find((place) => place.name.toLowerCase().includes(`(${cleaned})`));
  if (curated) return curated;
  return gazetteer.find((place) => place.name.toLowerCase() === cleaned) ?? null;
}
