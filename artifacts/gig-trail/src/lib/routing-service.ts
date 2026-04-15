interface CityCoords {
  lat: number;
  lon: number;
}

const CITY_COORDS: Record<string, CityCoords> = {
  "melbourne": { lat: -37.8136, lon: 144.9631 },
  "sydney": { lat: -33.8688, lon: 151.2093 },
  "brisbane": { lat: -27.4698, lon: 153.0251 },
  "adelaide": { lat: -34.9285, lon: 138.6007 },
  "perth": { lat: -31.9505, lon: 115.8605 },
  "hobart": { lat: -42.8821, lon: 147.3272 },
  "darwin": { lat: -12.4634, lon: 130.8456 },
  "canberra": { lat: -35.2809, lon: 149.1300 },
  "geelong": { lat: -38.1499, lon: 144.3617 },
  "ballarat": { lat: -37.5622, lon: 143.8503 },
  "bendigo": { lat: -36.7570, lon: 144.2794 },
  "wollongong": { lat: -34.4278, lon: 150.8931 },
  "newcastle": { lat: -32.9283, lon: 151.7817 },
  "gold coast": { lat: -28.0167, lon: 153.4000 },
  "cairns": { lat: -16.9186, lon: 145.7781 },
  "townsville": { lat: -19.2590, lon: 146.8169 },
  "rockhampton": { lat: -23.3780, lon: 150.5100 },
  "toowoomba": { lat: -27.5598, lon: 151.9507 },
  "launceston": { lat: -41.4332, lon: 147.1441 },
  "albury": { lat: -36.0737, lon: 146.9135 },
  "wodonga": { lat: -36.1218, lon: 146.8882 },
  "wangaratta": { lat: -36.3568, lon: 146.3124 },
  "shepparton": { lat: -36.3800, lon: 145.3983 },
  "warrnambool": { lat: -38.3830, lon: 142.4881 },
  "mildura": { lat: -34.1855, lon: 142.1625 },
  "sale": { lat: -38.1018, lon: 147.0673 },
  "traralgon": { lat: -38.1961, lon: 146.5431 },
  "bairnsdale": { lat: -37.8282, lon: 147.6098 },
  "castlemaine": { lat: -37.0632, lon: 144.2197 },
  "chewton": { lat: -37.1000, lon: 144.3000 },
  "myrtleford": { lat: -36.5654, lon: 146.7243 },
  "osborne flat": { lat: -36.5400, lon: 146.5500 },
  "yackandandah": { lat: -36.3119, lon: 146.8419 },
  "bright": { lat: -36.7268, lon: 146.9620 },
  "beechworth": { lat: -36.3592, lon: 146.6862 },
  "rutherglen": { lat: -36.0496, lon: 146.4580 },
  "cobram": { lat: -35.9228, lon: 145.6476 },
  "echuca": { lat: -36.1420, lon: 144.7553 },
  "swan hill": { lat: -35.3384, lon: 143.5528 },
  "colac": { lat: -38.3392, lon: 143.5845 },
  "apollo bay": { lat: -38.7582, lon: 143.6716 },
  "torquay": { lat: -38.3306, lon: 144.3269 },
  "lorne": { lat: -38.5456, lon: 143.9722 },
  "gisborne": { lat: -37.4886, lon: 144.5925 },
  "daylesford": { lat: -37.3509, lon: 144.1428 },
  "healesville": { lat: -37.6533, lon: 145.5131 },
  "marysville": { lat: -37.5114, lon: 145.7441 },
  "muswellbrook": { lat: -32.2650, lon: 150.8921 },
  "cessnock": { lat: -32.8302, lon: 151.3556 },
  "maitland": { lat: -32.7334, lon: 151.5547 },
  "singleton": { lat: -32.5669, lon: 151.1693 },
  "goulburn": { lat: -34.7544, lon: 149.7189 },
  "yass": { lat: -34.8415, lon: 148.9118 },
  "bega": { lat: -36.6780, lon: 149.8414 },
  "eden": { lat: -37.0617, lon: 149.8973 },
  "merimbula": { lat: -36.8953, lon: 149.9006 },
  "bundaberg north": { lat: -24.8500, lon: 152.3500 },
  "gympie": { lat: -26.1901, lon: 152.6657 },
  "nambour": { lat: -26.6270, lon: 152.9584 },
  "noosa": { lat: -26.3868, lon: 153.0048 },
  "maroochydore": { lat: -26.6531, lon: 153.0968 },
  "caloundra": { lat: -26.7982, lon: 153.1318 },
  "gladstone": { lat: -23.8427, lon: 151.2628 },
  "emerald": { lat: -23.5274, lon: 148.1607 },
  "mount isa": { lat: -20.7256, lon: 139.4927 },
  "warwick": { lat: -28.2124, lon: 152.0362 },
  "stanthorpe": { lat: -28.6543, lon: 151.9293 },
  "alice springs": { lat: -23.6980, lon: 133.8807 },
  "katherine": { lat: -14.4652, lon: 132.2635 },
  "broome": { lat: -17.9619, lon: 122.2361 },
  "port hedland": { lat: -20.3100, lon: 118.6134 },
  "geraldton": { lat: -28.7774, lon: 114.6148 },
  "kalgoorlie": { lat: -30.7490, lon: 121.4670 },
  "albany": { lat: -35.0269, lon: 117.8837 },
  "bunbury": { lat: -33.3271, lon: 115.6414 },
  "mandurah": { lat: -32.5270, lon: 115.7228 },
  "mount gambier": { lat: -37.8318, lon: 140.7799 },
  "whyalla": { lat: -33.0325, lon: 137.5753 },
  "port augusta": { lat: -32.4936, lon: 137.7620 },
  "murray bridge": { lat: -35.1194, lon: 139.2736 },
  "victor harbor": { lat: -35.5526, lon: 138.6182 },
  "horsham": { lat: -36.7100, lon: 142.2011 },
  "ararat": { lat: -37.2833, lon: 142.9333 },
  "hamilton": { lat: -37.7390, lon: 142.0233 },
  "frankston": { lat: -38.1441, lon: 145.1217 },
  "dandenong": { lat: -37.9831, lon: 145.2180 },
  "mornington": { lat: -38.2234, lon: 145.0432 },
  "williamstown": { lat: -37.8668, lon: 144.8952 },
  "collingwood": { lat: -37.8038, lon: 144.9922 },
  "fitzroy": { lat: -37.7996, lon: 144.9785 },
  "st kilda": { lat: -37.8600, lon: 144.9800 },
  "brunswick": { lat: -37.7656, lon: 144.9607 },
  "footscray": { lat: -37.8002, lon: 144.9005 },
  "richmond": { lat: -37.8182, lon: 145.0018 },
  "prahran": { lat: -37.8492, lon: 144.9920 },
  "narooma": { lat: -36.2185, lon: 150.0691 },
  "cooma": { lat: -36.2334, lon: 149.1319 },
  "bathurst": { lat: -33.4200, lon: 149.5786 },
  "dubbo": { lat: -32.2569, lon: 148.6011 },
  "tamworth": { lat: -31.0927, lon: 150.9320 },
  "armidale": { lat: -30.5127, lon: 151.6671 },
  "grafton": { lat: -29.6920, lon: 152.9322 },
  "coffs harbour": { lat: -30.2963, lon: 153.1135 },
  "port macquarie": { lat: -31.4323, lon: 152.9118 },
  "lismore": { lat: -28.8167, lon: 153.2778 },
  "byron bay": { lat: -28.6474, lon: 153.6020 },
  "ballina": { lat: -28.8647, lon: 153.5606 },
  "orange": { lat: -33.2833, lon: 149.1000 },
  "wagga wagga": { lat: -35.1082, lon: 147.3598 },
  "queanbeyan": { lat: -35.3533, lon: 149.2342 },
  "nowra": { lat: -34.8826, lon: 150.6000 },
  "kiama": { lat: -34.6710, lon: 150.8543 },
  "katoomba": { lat: -33.7150, lon: 150.3116 },
  "penrith": { lat: -33.7506, lon: 150.6942 },
  "parramatta": { lat: -33.8148, lon: 151.0017 },
  "mackay": { lat: -21.1551, lon: 149.1853 },
  "bundaberg": { lat: -24.8661, lon: 152.3489 },
  "hervey bay": { lat: -25.2882, lon: 152.8453 },
  "sunshine coast": { lat: -26.6500, lon: 153.0667 },
  "ipswich": { lat: -27.6167, lon: 152.7667 },
  "new york": { lat: 40.7128, lon: -74.0060 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  "chicago": { lat: 41.8781, lon: -87.6298 },
  "houston": { lat: 29.7604, lon: -95.3698 },
  "phoenix": { lat: 33.4484, lon: -112.0740 },
  "philadelphia": { lat: 39.9526, lon: -75.1652 },
  "san antonio": { lat: 29.4241, lon: -98.4936 },
  "san diego": { lat: 32.7157, lon: -117.1611 },
  "dallas": { lat: 32.7767, lon: -96.7970 },
  "san jose": { lat: 37.3382, lon: -121.8863 },
  "austin": { lat: 30.2672, lon: -97.7431 },
  "nashville": { lat: 36.1627, lon: -86.7816 },
  "denver": { lat: 39.7392, lon: -104.9903 },
  "seattle": { lat: 47.6062, lon: -122.3321 },
  "boston": { lat: 42.3601, lon: -71.0589 },
  "portland": { lat: 45.5051, lon: -122.6750 },
  "atlanta": { lat: 33.7490, lon: -84.3880 },
  "miami": { lat: 25.7617, lon: -80.1918 },
  "minneapolis": { lat: 44.9778, lon: -93.2650 },
  "new orleans": { lat: 29.9511, lon: -90.0715 },
  "london": { lat: 51.5074, lon: -0.1278 },
  "manchester": { lat: 53.4808, lon: -2.2426 },
  "birmingham": { lat: 52.4862, lon: -1.8904 },
  "glasgow": { lat: 55.8642, lon: -4.2518 },
  "edinburgh": { lat: 55.9533, lon: -3.1883 },
  "bristol": { lat: 51.4545, lon: -2.5879 },
  "leeds": { lat: 53.8008, lon: -1.5491 },
  "sheffield": { lat: 53.3811, lon: -1.4701 },
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.3);
}

function stripStateAndPostcode(s: string): string {
  return s
    .replace(/\s+\d{4,5}\s*$/, '')
    .replace(/\s+(vic|nsw|qld|sa|wa|tas|nt|act)\.?\s*$/i, '')
    .replace(/\s+\d{4,5}\s*$/, '')
    .trim();
}

function normalizeCity(city: string): string {
  const lower = city.toLowerCase().trim();

  // If it has commas it may be a full address like "7 Kolan St, Bundaberg North QLD 4670, Australia"
  if (lower.includes(',')) {
    const parts = lower.split(',').map(p => p.trim());
    const stateRe = /\s+(vic|nsw|qld|sa|wa|tas|nt|act)\.?\s*\d*\s*$/i;

    // Find the segment that contains a state abbreviation — that's the suburb/city segment
    for (const part of parts) {
      if (stateRe.test(part)) {
        const cleaned = stripStateAndPostcode(part);
        if (cleaned) return cleaned;
      }
    }

    // Fallback: if first part looks like a street address (starts with digit), skip it
    const first = parts[0];
    if (/^\d/.test(first) && parts.length > 1) {
      return stripStateAndPostcode(parts[1]);
    }

    return stripStateAndPostcode(first);
  }

  return stripStateAndPostcode(lower);
}

function lookupCityCoords(name: string): CityCoords | null {
  const direct = CITY_COORDS[name];
  if (direct) return direct;
  // Try stripping suburb qualifiers one word at a time (e.g. "bundaberg north" → "bundaberg")
  const words = name.split(/\s+/);
  for (let i = words.length - 1; i >= 1; i--) {
    const shorter = words.slice(0, i).join(' ');
    if (CITY_COORDS[shorter]) return CITY_COORDS[shorter];
  }
  return null;
}

export type DistanceSource = 'manual' | 'estimate' | 'unknown';

export interface RouteLeg {
  from: string;
  to: string;
  distanceKm: number;
  driveTimeMinutes: number;
  source: DistanceSource;
}

const AVG_ROAD_SPEED_KMH = 80;

export function estimateLegDistance(
  from: string,
  to: string,
  fromLat?: number | null,
  fromLng?: number | null,
  toLat?: number | null,
  toLng?: number | null,
): RouteLeg {
  const fromCoordsFromDB = fromLat != null && fromLng != null ? { lat: fromLat, lon: fromLng } : null;
  const toCoordsFromDB = toLat != null && toLng != null ? { lat: toLat, lon: toLng } : null;

  const fromCoords = fromCoordsFromDB ?? lookupCityCoords(normalizeCity(from));
  const toCoords = toCoordsFromDB ?? lookupCityCoords(normalizeCity(to));

  if (fromCoords && toCoords) {
    const distanceKm = haversineKm(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
    const driveTimeMinutes = distanceKm > 0 ? Math.round((distanceKm / AVG_ROAD_SPEED_KMH) * 60) : 0;
    return { from, to, distanceKm, driveTimeMinutes, source: 'estimate' };
  }

  return { from, to, distanceKm: 0, driveTimeMinutes: 0, source: 'unknown' };
}
