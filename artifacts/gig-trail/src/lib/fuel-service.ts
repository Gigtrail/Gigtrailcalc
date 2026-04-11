export type FuelPriceSource = 'manual' | 'regional-estimate' | 'default';

export interface FuelPriceResult {
  pricePerLitre: number;
  source: FuelPriceSource;
  label: string;
}

const REGIONAL_PRICES: Record<string, number> = {
  vic: 2.00,
  nsw: 2.05,
  qld: 1.98,
  sa: 2.10,
  wa: 2.20,
  tas: 2.15,
  nt: 2.25,
  act: 2.05,
  default: 2.00,
};

const STATE_PATTERNS: Array<[RegExp, string]> = [
  [/\bvic(toria)?\b/i, 'vic'],
  [/\bnsw\b|\bnew south wales\b/i, 'nsw'],
  [/\bqld\b|\bqueensland\b/i, 'qld'],
  [/\bsa\b|\bsouth aus(tralia)?\b/i, 'sa'],
  [/\bwa\b|\bwestern aus(tralia)?\b/i, 'wa'],
  [/\btas(mania)?\b/i, 'tas'],
  [/\bnt\b|\bnorthern territory\b/i, 'nt'],
  [/\bact\b|\baustralian capital\b/i, 'act'],
];

const CITY_TO_STATE: Record<string, string> = {
  melbourne: 'vic', geelong: 'vic', ballarat: 'vic', bendigo: 'vic',
  shepparton: 'vic', wangaratta: 'vic', wodonga: 'vic', horsham: 'vic',
  castlemaine: 'vic', chewton: 'vic', myrtleford: 'vic', 'osborne flat': 'vic',
  traralgon: 'vic', bairnsdale: 'vic', sale: 'vic', warrnambool: 'vic',
  mildura: 'vic', ararat: 'vic', hamilton: 'vic', frankston: 'vic',
  richmond: 'vic', collingwood: 'vic', fitzroy: 'vic', brunswick: 'vic',
  'st kilda': 'vic', footscray: 'vic', prahran: 'vic',
  sydney: 'nsw', wollongong: 'nsw', newcastle: 'nsw', albury: 'nsw',
  canberra: 'act', bathurst: 'nsw', dubbo: 'nsw', tamworth: 'nsw',
  'wagga wagga': 'nsw', 'coffs harbour': 'nsw', 'byron bay': 'nsw',
  brisbane: 'qld', 'gold coast': 'qld', cairns: 'qld', townsville: 'qld',
  rockhampton: 'qld', toowoomba: 'qld', bundaberg: 'qld', mackay: 'qld',
  'sunshine coast': 'qld', ipswich: 'qld',
  adelaide: 'sa',
  perth: 'wa',
  hobart: 'tas', launceston: 'tas',
  darwin: 'nt',
};

export function getFuelPrice(city: string, manualOverride?: number | null): FuelPriceResult {
  const n = parseFloat(String(manualOverride ?? ''));
  if (!Number.isNaN(n) && n > 0) {
    return { pricePerLitre: n, source: 'manual', label: 'Manual fuel price' };
  }

  for (const [pattern, stateKey] of STATE_PATTERNS) {
    if (pattern.test(city)) {
      return {
        pricePerLitre: REGIONAL_PRICES[stateKey],
        source: 'regional-estimate',
        label: `Auto estimate (${stateKey.toUpperCase()})`,
      };
    }
  }

  const cityKey = city.toLowerCase().replace(/,.*$/, '').trim();
  const state = CITY_TO_STATE[cityKey];
  if (state) {
    return {
      pricePerLitre: REGIONAL_PRICES[state],
      source: 'regional-estimate',
      label: `Auto estimate (${state.toUpperCase()})`,
    };
  }

  return {
    pricePerLitre: REGIONAL_PRICES.default,
    source: 'default',
    label: 'Default estimate',
  };
}
