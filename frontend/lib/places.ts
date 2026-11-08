/**
 * Small gazetteer for the region map: places named in Risk Radar titles and alert reports, with approximate
 * coordinates (town or region centre, good to roughly 10–30 km). A keyword list, not geocoding, in the same
 * spirit as ml/pipeline/region_match.py. A place is used only when it lies in one of the risk's countries.
 */

export interface Place {
  name: string; // label on the map
  country: string; // ACAPS country name
  at: [number, number]; // [longitude, latitude]
  aliases: string[]; // folded (lower case, no accents)
}

const P = (name: string, country: string, lat: number, lon: number, aliases: string[]): Place => ({
  name,
  country,
  at: [lon, lat],
  aliases,
});

// Towns before regions in each country: a title naming both ("Al Obeid, North Kordofan") is centred on the town
// because it appears first in the text; order here only breaks ties.
export const PLACES: Place[] = [
  // Sudan
  P('Al Obeid', 'Sudan', 13.18, 30.22, ['al obeid', 'el obeid', 'el-obeid', 'al-ubayyid', 'el obied']),
  P('Kadugli', 'Sudan', 11.01, 29.72, ['kadugli']),
  P('El Fasher', 'Sudan', 13.63, 25.35, ['el fasher', 'al fasher', 'al-fashir', 'el-fasher']),
  P('El Geneina', 'Sudan', 13.45, 22.45, ['el geneina', 'al geneina', 'geneina']),
  P('Nyala', 'Sudan', 12.05, 24.88, ['nyala']),
  P('Khartoum', 'Sudan', 15.5, 32.56, ['khartoum', 'omdurman']),
  P('Port Sudan', 'Sudan', 19.62, 37.22, ['port sudan']),
  P('Merowe Dam', 'Sudan', 18.67, 32.05, ['merowe']),
  P('Wad Madani', 'Sudan', 14.4, 33.52, ['wad madani', 'gezira', 'al jazirah']),
  P('Babanusa', 'Sudan', 11.33, 27.81, ['babanusa']),
  P('North Kordofan', 'Sudan', 14.0, 29.5, ['north kordofan']),
  P('West Kordofan', 'Sudan', 11.5, 28.0, ['west kordofan']),
  P('South Kordofan', 'Sudan', 11.0, 30.0, ['south kordofan', 'nuba mountains']),
  P('North Darfur', 'Sudan', 15.5, 25.0, ['north darfur']),
  P('West Darfur', 'Sudan', 13.0, 22.6, ['west darfur']),
  P('White Nile state', 'Sudan', 13.5, 32.5, ['white nile']),
  P('Blue Nile state', 'Sudan', 11.3, 34.2, ['blue nile']),
  P('Red Sea state', 'Sudan', 19.5, 36.5, ['red sea state']),
  P('Northern state', 'Sudan', 19.5, 31.0, ['northern state']),
  // Chad and the Lake Chad Basin
  P('Adré', 'Chad', 13.47, 22.2, ['adre']),
  P('Abéché', 'Chad', 13.83, 20.83, ['abeche']),
  P('Eastern Chad', 'Chad', 13.5, 21.5, ['eastern chad', 'ouaddai']),
  P('Lake Chad Basin', 'Chad', 13.2, 14.2, ['lake chad']),
  // South Sudan
  P('Akobo', 'South Sudan', 7.78, 33.0, ['akobo']),
  P('Malakal', 'South Sudan', 9.53, 31.66, ['malakal']),
  // Syria
  P('As Sweida', 'Syria', 32.71, 36.57, ['as sweida', 'sweida', 'suwayda', 'as-suwayda']),
  // Palestine
  P('Gaza (Yellow Line)', 'Palestine', 31.42, 34.37, ['yellow line', 'gaza']),
  P('E1 area', 'Palestine', 31.8, 35.28, ['e1 settlement', 'e1 plan']),
  // Mozambique
  P('Cabo Delgado', 'Mozambique', -12.3, 39.3, ['cabo delgado']),
  P('Niassa', 'Mozambique', -13.3, 36.0, ['niassa']),
  P('Nampula', 'Mozambique', -15.12, 39.27, ['nampula']),
  // Afghanistan
  P('Badakhshan', 'Afghanistan', 37.0, 71.0, ['badakhshan']),
  // Niger
  P('Tillabéri', 'Niger', 14.21, 1.45, ['tillaberi', 'tillab ri', 'western niger'] /* 'tillab ri': the export's broken "é" */),
  P('Tahoua', 'Niger', 14.89, 5.26, ['tahoua']),
  P('Dosso', 'Niger', 13.05, 3.19, ['dosso']),
  // Myanmar
  P('Dawei', 'Myanmar', 14.08, 98.19, ['dawei', 'tanintharyi']),
];

const fold = (s: string) =>
  ' ' +
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') +
  ' ';

/** Places named in `text` that lie in one of `countries`, in order of first appearance. */
export function findPlaces(text: string | null | undefined, countries: string[]): Place[] {
  if (!text) return [];
  const folded = fold(text);
  const found: { place: Place; pos: number }[] = [];
  for (const place of PLACES) {
    if (!countries.includes(place.country)) continue;
    const pos = Math.min(
      ...place.aliases.map((a) => {
        const i = folded.indexOf(fold(a));
        return i < 0 ? Infinity : i;
      }),
    );
    if (pos !== Infinity) found.push({ place, pos });
  }
  return found.sort((a, b) => a.pos - b.pos).map((f) => f.place);
}
