import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  profilesTable,
  tourStopsTable,
  toursTable,
  tourVehiclesTable,
  vehiclesTable,
} from "@workspace/db";

type TourRow = typeof toursTable.$inferSelect;
type StopRow = typeof tourStopsTable.$inferSelect;
type ProfileRow = typeof profilesTable.$inferSelect;
type VehicleRow = typeof vehiclesTable.$inferSelect;

const SINGLE_ROOM_RATE = 120;
const DOUBLE_ROOM_RATE = 180;
const DEFAULT_PETROL_PRICE = 1.9;
const DEFAULT_DIESEL_PRICE = 1.95;
const DEFAULT_LPG_PRICE = 0.95;
const AVG_ROAD_SPEED_KMH = 80;

type FuelPriceSource = "manual" | "regional-estimate" | "default";
type DistanceSource = "manual" | "estimate" | "unknown";

interface DerivedVehicleInput {
  id: number;
  name: string;
  fuelType: string;
  avgConsumption: number;
}

interface DerivedTourMetrics {
  stopCount: number;
  totalDistance: number;
  totalCost: number;
  totalIncome: number;
  totalProfit: number;
  totalAccommodationCost: number;
  totalFoodCost: number;
  totalMarketingCost: number;
}

interface TourDerivations {
  metricsByTourId: Map<number, DerivedTourMetrics>;
  stopsByTourId: Map<number, StopRow[]>;
}

const CANCELLED_STOP_STATUSES = new Set(["cancelled", "canceled"]);

const REGIONAL_PRICES: Record<string, number> = {
  vic: 2.0,
  nsw: 2.05,
  qld: 1.98,
  sa: 2.1,
  wa: 2.2,
  tas: 2.15,
  nt: 2.25,
  act: 2.05,
  default: 2.0,
};

const STATE_PATTERNS: Array<[RegExp, string]> = [
  [/\bvic(toria)?\b/i, "vic"],
  [/\bnsw\b|\bnew south wales\b/i, "nsw"],
  [/\bqld\b|\bqueensland\b/i, "qld"],
  [/\bsa\b|\bsouth aus(tralia)?\b/i, "sa"],
  [/\bwa\b|\bwestern aus(tralia)?\b/i, "wa"],
  [/\btas(mania)?\b/i, "tas"],
  [/\bnt\b|\bnorthern territory\b/i, "nt"],
  [/\bact\b|\baustralian capital\b/i, "act"],
];

const CITY_TO_STATE: Record<string, string> = {
  melbourne: "vic", geelong: "vic", ballarat: "vic", bendigo: "vic",
  shepparton: "vic", wangaratta: "vic", wodonga: "vic", horsham: "vic",
  castlemaine: "vic", chewton: "vic", myrtleford: "vic", "osborne flat": "vic",
  traralgon: "vic", bairnsdale: "vic", sale: "vic", warrnambool: "vic",
  mildura: "vic", ararat: "vic", hamilton: "vic", frankston: "vic",
  richmond: "vic", collingwood: "vic", fitzroy: "vic", brunswick: "vic",
  "st kilda": "vic", footscray: "vic", prahran: "vic",
  sydney: "nsw", wollongong: "nsw", newcastle: "nsw", albury: "nsw",
  canberra: "act", bathurst: "nsw", dubbo: "nsw", tamworth: "nsw",
  "wagga wagga": "nsw", "coffs harbour": "nsw", "byron bay": "nsw",
  brisbane: "qld", "gold coast": "qld", cairns: "qld", townsville: "qld",
  rockhampton: "qld", toowoomba: "qld", bundaberg: "qld", mackay: "qld",
  "sunshine coast": "qld", ipswich: "qld",
  adelaide: "sa",
  perth: "wa",
  hobart: "tas", launceston: "tas",
  darwin: "nt",
};

interface CityCoords {
  lat: number;
  lon: number;
}

const CITY_COORDS: Record<string, CityCoords> = {
  melbourne: { lat: -37.8136, lon: 144.9631 },
  sydney: { lat: -33.8688, lon: 151.2093 },
  brisbane: { lat: -27.4698, lon: 153.0251 },
  adelaide: { lat: -34.9285, lon: 138.6007 },
  perth: { lat: -31.9505, lon: 115.8605 },
  hobart: { lat: -42.8821, lon: 147.3272 },
  darwin: { lat: -12.4634, lon: 130.8456 },
  canberra: { lat: -35.2809, lon: 149.13 },
  geelong: { lat: -38.1499, lon: 144.3617 },
  ballarat: { lat: -37.5622, lon: 143.8503 },
  bendigo: { lat: -36.757, lon: 144.2794 },
  wollongong: { lat: -34.4278, lon: 150.8931 },
  newcastle: { lat: -32.9283, lon: 151.7817 },
  "gold coast": { lat: -28.0167, lon: 153.4 },
  cairns: { lat: -16.9186, lon: 145.7781 },
  townsville: { lat: -19.259, lon: 146.8169 },
  rockhampton: { lat: -23.378, lon: 150.51 },
  toowoomba: { lat: -27.5598, lon: 151.9507 },
  launceston: { lat: -41.4332, lon: 147.1441 },
  albury: { lat: -36.0737, lon: 146.9135 },
  wodonga: { lat: -36.1218, lon: 146.8882 },
  wangaratta: { lat: -36.3568, lon: 146.3124 },
  shepparton: { lat: -36.38, lon: 145.3983 },
  warrnambool: { lat: -38.383, lon: 142.4881 },
  mildura: { lat: -34.1855, lon: 142.1625 },
  sale: { lat: -38.1018, lon: 147.0673 },
  traralgon: { lat: -38.1961, lon: 146.5431 },
  bairnsdale: { lat: -37.8282, lon: 147.6098 },
  castlemaine: { lat: -37.0632, lon: 144.2197 },
  chewton: { lat: -37.1, lon: 144.3 },
  myrtleford: { lat: -36.5654, lon: 146.7243 },
  "osborne flat": { lat: -36.54, lon: 146.55 },
  yackandandah: { lat: -36.3119, lon: 146.8419 },
  bright: { lat: -36.7268, lon: 146.962 },
  beechworth: { lat: -36.3592, lon: 146.6862 },
  rutherglen: { lat: -36.0496, lon: 146.458 },
  cobram: { lat: -35.9228, lon: 145.6476 },
  echuca: { lat: -36.142, lon: 144.7553 },
  "swan hill": { lat: -35.3384, lon: 143.5528 },
  colac: { lat: -38.3392, lon: 143.5845 },
  "apollo bay": { lat: -38.7582, lon: 143.6716 },
  torquay: { lat: -38.3306, lon: 144.3269 },
  lorne: { lat: -38.5456, lon: 143.9722 },
  gisborne: { lat: -37.4886, lon: 144.5925 },
  daylesford: { lat: -37.3509, lon: 144.1428 },
  healesville: { lat: -37.6533, lon: 145.5131 },
  marysville: { lat: -37.5114, lon: 145.7441 },
  muswellbrook: { lat: -32.265, lon: 150.8921 },
  cessnock: { lat: -32.8302, lon: 151.3556 },
  maitland: { lat: -32.7334, lon: 151.5547 },
  singleton: { lat: -32.5669, lon: 151.1693 },
  goulburn: { lat: -34.7544, lon: 149.7189 },
  yass: { lat: -34.8415, lon: 148.9118 },
  bega: { lat: -36.678, lon: 149.8414 },
  eden: { lat: -37.0617, lon: 149.8973 },
  merimbula: { lat: -36.8953, lon: 149.9006 },
  "bundaberg north": { lat: -24.85, lon: 152.35 },
  gympie: { lat: -26.1901, lon: 152.6657 },
  nambour: { lat: -26.627, lon: 152.9584 },
  noosa: { lat: -26.3868, lon: 153.0048 },
  maroochydore: { lat: -26.6531, lon: 153.0968 },
  caloundra: { lat: -26.7982, lon: 153.1318 },
  gladstone: { lat: -23.8427, lon: 151.2628 },
  emerald: { lat: -23.5274, lon: 148.1607 },
  "mount isa": { lat: -20.7256, lon: 139.4927 },
  warwick: { lat: -28.2124, lon: 152.0362 },
  stanthorpe: { lat: -28.6543, lon: 151.9293 },
  "alice springs": { lat: -23.698, lon: 133.8807 },
  katherine: { lat: -14.4652, lon: 132.2635 },
  broome: { lat: -17.9619, lon: 122.2361 },
  "port hedland": { lat: -20.31, lon: 118.6134 },
  geraldton: { lat: -28.7774, lon: 114.6148 },
  kalgoorlie: { lat: -30.749, lon: 121.467 },
  albany: { lat: -35.0269, lon: 117.8837 },
  bunbury: { lat: -33.3271, lon: 115.6414 },
  mandurah: { lat: -32.527, lon: 115.7228 },
  "mount gambier": { lat: -37.8318, lon: 140.7799 },
  whyalla: { lat: -33.0325, lon: 137.5753 },
  "port augusta": { lat: -32.4936, lon: 137.762 },
  "murray bridge": { lat: -35.1194, lon: 139.2736 },
  "victor harbor": { lat: -35.5526, lon: 138.6182 },
  horsham: { lat: -36.71, lon: 142.2011 },
  ararat: { lat: -37.2833, lon: 142.9333 },
  hamilton: { lat: -37.739, lon: 142.0233 },
  frankston: { lat: -38.1441, lon: 145.1217 },
  dandenong: { lat: -37.9831, lon: 145.218 },
  mornington: { lat: -38.2234, lon: 145.0432 },
  williamstown: { lat: -37.8668, lon: 144.8952 },
  collingwood: { lat: -37.8038, lon: 144.9922 },
  fitzroy: { lat: -37.7996, lon: 144.9785 },
  "st kilda": { lat: -37.86, lon: 144.98 },
  brunswick: { lat: -37.7656, lon: 144.9607 },
  footscray: { lat: -37.8002, lon: 144.9005 },
  richmond: { lat: -37.8182, lon: 145.0018 },
  prahran: { lat: -37.8492, lon: 144.992 },
  narooma: { lat: -36.2185, lon: 150.0691 },
  cooma: { lat: -36.2334, lon: 149.1319 },
  bathurst: { lat: -33.42, lon: 149.5786 },
  dubbo: { lat: -32.2569, lon: 148.6011 },
  tamworth: { lat: -31.0927, lon: 150.932 },
  armidale: { lat: -30.5127, lon: 151.6671 },
  grafton: { lat: -29.692, lon: 152.9322 },
  "coffs harbour": { lat: -30.2963, lon: 153.1135 },
  "port macquarie": { lat: -31.4323, lon: 152.9118 },
  lismore: { lat: -28.8167, lon: 153.2778 },
  "byron bay": { lat: -28.6474, lon: 153.602 },
  ballina: { lat: -28.8647, lon: 153.5606 },
  orange: { lat: -33.2833, lon: 149.1 },
  "wagga wagga": { lat: -35.1082, lon: 147.3598 },
  queanbeyan: { lat: -35.3533, lon: 149.2342 },
  nowra: { lat: -34.8826, lon: 150.6 },
  kiama: { lat: -34.671, lon: 150.8543 },
  katoomba: { lat: -33.715, lon: 150.3116 },
  penrith: { lat: -33.7506, lon: 150.6942 },
  parramatta: { lat: -33.8148, lon: 151.0017 },
  mackay: { lat: -21.1551, lon: 149.1853 },
  bundaberg: { lat: -24.8661, lon: 152.3489 },
  "hervey bay": { lat: -25.2882, lon: 152.8453 },
  "sunshine coast": { lat: -26.65, lon: 153.0667 },
  ipswich: { lat: -27.6167, lon: 152.7667 },
};

function n(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getISODate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("T")[0];
}

function calculateShowIncome(stop: StopRow): number {
  if (stop.showType === "Flat Fee") {
    return n(stop.fee);
  }

  if (stop.showType === "Ticketed Show" || stop.showType === "Hybrid") {
    const expectedTicketsSold = Math.floor((n(stop.capacity) * n(stop.expectedAttendancePct)) / 100);
    const grossRevenue = expectedTicketsSold * n(stop.ticketPrice);
    const effectiveDealType = stop.dealType ?? "100% door";
    let doorIncome = 0;

    if (stop.showType === "Hybrid") {
      const hybridSplit =
        effectiveDealType === "percentage split" || effectiveDealType === "guarantee vs door"
          ? n(stop.splitPct)
          : 100;
      doorIncome = grossRevenue * (hybridSplit / 100);
    } else if (effectiveDealType === "100% door") {
      doorIncome = grossRevenue;
    } else if (effectiveDealType === "percentage split") {
      doorIncome = grossRevenue * (n(stop.splitPct) / 100);
    } else if (effectiveDealType === "guarantee vs door") {
      doorIncome = Math.max(n(stop.guarantee), grossRevenue * (n(stop.splitPct) / 100));
    }

    return stop.showType === "Hybrid" ? n(stop.guarantee) + doorIncome : doorIncome;
  }

  return 0;
}

function calculateFuelCost(distanceKm: number, consumptionLPer100: number, pricePerLitre: number): number {
  const fuelUsedLitres = consumptionLPer100 > 0 ? (distanceKm * consumptionLPer100) / 100 : 0;
  return fuelUsedLitres * pricePerLitre;
}

function stripStateAndPostcode(value: string): string {
  return value
    .replace(/\s+\d{4,5}\s*$/, "")
    .replace(/\s+(vic|nsw|qld|sa|wa|tas|nt|act)\.?\s*$/i, "")
    .replace(/\s+\d{4,5}\s*$/, "")
    .trim();
}

function normalizeCity(value: string): string {
  const lower = value.toLowerCase().trim();
  if (lower.includes(",")) {
    const parts = lower.split(",").map(part => part.trim());
    const stateRegex = /\s+(vic|nsw|qld|sa|wa|tas|nt|act)\.?\s*\d*\s*$/i;

    for (const part of parts) {
      if (stateRegex.test(part)) {
        const cleaned = stripStateAndPostcode(part);
        if (cleaned) return cleaned;
      }
    }

    if (/^\d/.test(parts[0] ?? "") && parts.length > 1) {
      return stripStateAndPostcode(parts[1]);
    }

    return stripStateAndPostcode(parts[0] ?? "");
  }

  return stripStateAndPostcode(lower);
}

function lookupCityCoords(name: string): CityCoords | null {
  const direct = CITY_COORDS[name];
  if (direct) return direct;

  const words = name.split(/\s+/);
  for (let i = words.length - 1; i >= 1; i--) {
    const shorter = words.slice(0, i).join(" ");
    if (CITY_COORDS[shorter]) return CITY_COORDS[shorter];
  }

  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 1.3);
}

function estimateLegDistance(
  from: string,
  to: string,
  fromLat?: number | null,
  fromLng?: number | null,
  toLat?: number | null,
  toLng?: number | null,
): { distanceKm: number; source: DistanceSource } {
  const fromCoords = fromLat != null && fromLng != null
    ? { lat: fromLat, lon: fromLng }
    : lookupCityCoords(normalizeCity(from));
  const toCoords = toLat != null && toLng != null
    ? { lat: toLat, lon: toLng }
    : lookupCityCoords(normalizeCity(to));

  if (!fromCoords || !toCoords) {
    return { distanceKm: 0, source: "unknown" };
  }

  return {
    distanceKm: haversineKm(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon),
    source: "estimate",
  };
}

function getFuelPrice(city: string, manualOverride?: number | null, tourFuelPrice?: number | null): {
  pricePerLitre: number;
  source: FuelPriceSource;
} {
  const manual = n(manualOverride);
  if (manual > 0) {
    return { pricePerLitre: manual, source: "manual" };
  }

  const tourLevel = n(tourFuelPrice);
  if (tourLevel > 0) {
    return { pricePerLitre: tourLevel, source: "manual" };
  }

  for (const [pattern, stateKey] of STATE_PATTERNS) {
    if (pattern.test(city)) {
      return {
        pricePerLitre: REGIONAL_PRICES[stateKey] ?? REGIONAL_PRICES.default,
        source: "regional-estimate",
      };
    }
  }

  const cityKey = city.toLowerCase().replace(/,.*$/, "").trim();
  const state = CITY_TO_STATE[cityKey];
  if (state) {
    return {
      pricePerLitre: REGIONAL_PRICES[state] ?? REGIONAL_PRICES.default,
      source: "regional-estimate",
    };
  }

  return {
    pricePerLitre: REGIONAL_PRICES.default,
    source: "default",
  };
}

function detectBlankDayCount(stops: StopRow[], startDate?: string | null, endDate?: string | null): number {
  const showDates = new Set<string>();
  for (const stop of stops) {
    const date = getISODate(stop.date);
    if (date) showDates.add(date);
  }

  const allShowDates = [...showDates].sort();
  if (allShowDates.length === 0 && !startDate && !endDate) return 0;

  const rangeStart = getISODate(startDate) ?? allShowDates[0] ?? null;
  const rangeEnd = getISODate(endDate) ?? allShowDates[allShowDates.length - 1] ?? null;
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return 0;

  let blankDays = 0;
  const current = new Date(`${rangeStart}T00:00:00Z`);
  const end = new Date(`${rangeEnd}T00:00:00Z`);

  while (current <= end) {
    const currentDate = current.toISOString().split("T")[0];
    if (!showDates.has(currentDate)) blankDays++;
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return blankDays;
}

function calculateTourMetrics(
  tour: TourRow,
  stops: StopRow[],
  profile: ProfileRow | null,
  vehicles: DerivedVehicleInput[],
): DerivedTourMetrics {
  const sortedStops = [...stops].sort((a, b) => {
    const leftDate = getISODate(a.date);
    const rightDate = getISODate(b.date);
    if (leftDate && rightDate && leftDate !== rightDate) {
      return leftDate < rightDate ? -1 : 1;
    }
    return a.stopOrder - b.stopOrder;
  });

  const fleetVehicles = vehicles.length > 0 ? vehicles : null;
  const consumption = fleetVehicles
    ? fleetVehicles.reduce((sum, vehicle) => sum + n(vehicle.avgConsumption), 0)
    : 0;

  type LocationNode = { name: string; lat?: number | null; lng?: number | null; stop?: StopRow };
  const locations: LocationNode[] = [];
  if (tour.startLocation?.trim()) {
    locations.push({
      name: tour.startLocation.trim(),
      lat: tour.startLocationLat != null ? Number(tour.startLocationLat) : null,
      lng: tour.startLocationLng != null ? Number(tour.startLocationLng) : null,
    });
  }

  const validStops = sortedStops.filter(stop => stop.city?.trim());
  for (const stop of validStops) {
    locations.push({
      name: stop.city,
      lat: stop.cityLat != null ? Number(stop.cityLat) : null,
      lng: stop.cityLng != null ? Number(stop.cityLng) : null,
      stop,
    });
  }

  if (tour.returnHome) {
    const destination = tour.endLocation?.trim() || tour.startLocation?.trim();
    if (destination) {
      locations.push({
        name: destination,
        lat: tour.endLocation?.trim()
          ? (tour.endLocationLat != null ? Number(tour.endLocationLat) : null)
          : (tour.startLocationLat != null ? Number(tour.startLocationLat) : null),
        lng: tour.endLocation?.trim()
          ? (tour.endLocationLng != null ? Number(tour.endLocationLng) : null)
          : (tour.startLocationLng != null ? Number(tour.startLocationLng) : null),
      });
    }
  }

  const activeFuelType = (tour.fuelType ?? "petrol").toLowerCase();
  const fuelPrices = {
    petrol: n(tour.fuelPricePetrol) || DEFAULT_PETROL_PRICE,
    diesel: n(tour.fuelPriceDiesel) || DEFAULT_DIESEL_PRICE,
    lpg: n(tour.fuelPriceLpg) || DEFAULT_LPG_PRICE,
  };
  const singleFuelPrice = n(tour.fuelPrice);
  const tourFuelPrice = singleFuelPrice > 0
    ? singleFuelPrice
    : activeFuelType === "diesel"
      ? fuelPrices.diesel
      : activeFuelType === "lpg"
        ? fuelPrices.lpg
        : fuelPrices.petrol;

  let totalDistance = 0;
  let totalFuelCost = 0;

  for (let index = 0; index < locations.length - 1; index++) {
    const sourceNode = locations[index];
    const destinationNode = locations[index + 1];
    const destinationStop = destinationNode.stop;

    let distanceKm = 0;
    if (destinationStop && n(destinationStop.distanceOverride) > 0) {
      distanceKm = n(destinationStop.distanceOverride);
    } else {
      distanceKm = estimateLegDistance(
        sourceNode.name,
        destinationNode.name,
        sourceNode.lat,
        sourceNode.lng,
        destinationNode.lat,
        destinationNode.lng,
      ).distanceKm;
    }

    const fuelPrice = getFuelPrice(
      destinationNode.name,
      destinationStop?.fuelPriceOverride != null ? Number(destinationStop.fuelPriceOverride) : null,
      tourFuelPrice,
    );

    totalDistance += distanceKm;
    totalFuelCost += calculateFuelCost(distanceKm, consumption, fuelPrice.pricePerLitre);
  }

  const totalShowIncome = sortedStops.reduce((sum, stop) => sum + calculateShowIncome(stop), 0);
  const totalMerchIncome = sortedStops.reduce((sum, stop) => sum + n(stop.merchEstimate), 0);
  const grossIncome = totalShowIncome + totalMerchIncome;

  const totalStopAccommodation = sortedStops.reduce((sum, stop) => sum + n(stop.accommodationCost), 0);
  const totalMarketingCost = sortedStops.reduce((sum, stop) => sum + n(stop.marketingCost), 0);
  const totalExtraCosts = sortedStops.reduce((sum, stop) => sum + n(stop.extraCosts), 0);

  const nightlyAccomRate = profile
    ? (n(profile.avgAccomPerNight) > 0
        ? n(profile.avgAccomPerNight)
        : n(profile.singleRoomsDefault) * SINGLE_ROOM_RATE + n(profile.doubleRoomsDefault) * DOUBLE_ROOM_RATE)
    : 0;

  const foodPerDay = n(profile?.avgFoodPerDay);
  const accommodationRequired = profile?.accommodationRequired ?? false;
  const rangeStart = getISODate(tour.startDate);
  const rangeEnd = getISODate(tour.endDate);
  const hasExplicitDateRange = !!rangeStart && !!rangeEnd && rangeStart <= rangeEnd;

  let totalFoodCost = 0;
  let blankDayAccommodation = 0;

  if (hasExplicitDateRange && rangeStart && rangeEnd) {
    const blankDayCount = detectBlankDayCount(sortedStops, tour.startDate, tour.endDate);
    const start = new Date(`${rangeStart}T00:00:00Z`);
    const end = new Date(`${rangeEnd}T00:00:00Z`);
    const totalDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    totalFoodCost = totalDays > 0 ? totalDays * foodPerDay : 0;
    blankDayAccommodation = accommodationRequired ? blankDayCount * nightlyAccomRate : 0;
  } else {
    const daysOnTour = n(tour.daysOnTour);
    const accommodationNights = daysOnTour > 0 ? Math.max(0, daysOnTour - 1) : 0;
    blankDayAccommodation = accommodationRequired ? accommodationNights * nightlyAccomRate : 0;
  }

  const totalAccommodationCost = totalStopAccommodation + blankDayAccommodation;
  const tourLevelOtherCosts =
    n(tour.flightsCost) + n(tour.ferriesTollsCost) + n(tour.gearHireCost) + n(tour.otherCosts);
  const totalCost =
    totalFuelCost +
    totalAccommodationCost +
    totalFoodCost +
    totalMarketingCost +
    totalExtraCosts +
    tourLevelOtherCosts;
  const totalProfit = grossIncome - totalCost;

  return {
    stopCount: sortedStops.length,
    totalDistance: Math.round(totalDistance),
    totalCost: roundMoney(totalCost),
    totalIncome: roundMoney(grossIncome),
    totalProfit: roundMoney(totalProfit),
    totalAccommodationCost: roundMoney(totalAccommodationCost),
    totalFoodCost: roundMoney(totalFoodCost),
    totalMarketingCost: roundMoney(totalMarketingCost),
  };
}

export async function loadTourDerivations(userId: string, tours: TourRow[]): Promise<TourDerivations> {
  const metricsByTourId = new Map<number, DerivedTourMetrics>();
  const stopsByTourId = new Map<number, StopRow[]>();

  if (tours.length === 0) {
    return { metricsByTourId, stopsByTourId };
  }

  const tourIds = tours.map(tour => tour.id);
  const profileIds = [...new Set(tours.map(tour => tour.profileId).filter((id): id is number => id != null))];

  const [stops, profiles, assignedVehicleRows] = await Promise.all([
    db
      .select()
      .from(tourStopsTable)
      .where(inArray(tourStopsTable.tourId, tourIds))
      .orderBy(tourStopsTable.tourId, tourStopsTable.stopOrder),
    profileIds.length > 0
      ? db
          .select()
          .from(profilesTable)
          .where(and(eq(profilesTable.userId, userId), inArray(profilesTable.id, profileIds)))
      : Promise.resolve([] as ProfileRow[]),
    db
      .select({
        tourId: tourVehiclesTable.tourId,
        vehicle: vehiclesTable,
      })
      .from(tourVehiclesTable)
      .innerJoin(vehiclesTable, eq(tourVehiclesTable.vehicleId, vehiclesTable.id))
      .where(inArray(tourVehiclesTable.tourId, tourIds)),
  ]);

  for (const stop of stops) {
    const bookingStatus = (stop.bookingStatus ?? "confirmed").toLowerCase();
    if (CANCELLED_STOP_STATUSES.has(bookingStatus)) {
      continue;
    }
    const existingStops = stopsByTourId.get(stop.tourId) ?? [];
    existingStops.push(stop);
    stopsByTourId.set(stop.tourId, existingStops);
  }

  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const assignedVehiclesByTourId = new Map<number, DerivedVehicleInput[]>();
  for (const row of assignedVehicleRows) {
    const list = assignedVehiclesByTourId.get(row.tourId) ?? [];
    list.push({
      id: row.vehicle.id,
      name: row.vehicle.name,
      fuelType: row.vehicle.fuelType,
      avgConsumption: Number(row.vehicle.avgConsumption),
    });
    assignedVehiclesByTourId.set(row.tourId, list);
  }

  const fallbackVehicleIds = [
    ...new Set(
      tours
        .filter(tour => (assignedVehiclesByTourId.get(tour.id)?.length ?? 0) === 0 && tour.vehicleId != null)
        .map(tour => tour.vehicleId as number),
    ),
  ];

  const fallbackVehicles = fallbackVehicleIds.length > 0
    ? await db
        .select()
        .from(vehiclesTable)
        .where(and(eq(vehiclesTable.userId, userId), inArray(vehiclesTable.id, fallbackVehicleIds)))
    : [];
  const fallbackVehicleById = new Map(fallbackVehicles.map(vehicle => [vehicle.id, vehicle]));

  for (const tour of tours) {
    const assignedVehicles = assignedVehiclesByTourId.get(tour.id) ?? [];
    const fallbackVehicle = assignedVehicles.length === 0 && tour.vehicleId != null
      ? fallbackVehicleById.get(tour.vehicleId)
      : null;

    const vehicles = assignedVehicles.length > 0
      ? assignedVehicles
      : fallbackVehicle
        ? [{
            id: fallbackVehicle.id,
            name: fallbackVehicle.name,
            fuelType: fallbackVehicle.fuelType,
            avgConsumption: Number(fallbackVehicle.avgConsumption),
          }]
        : [];

    metricsByTourId.set(
      tour.id,
      calculateTourMetrics(
        tour,
        stopsByTourId.get(tour.id) ?? [],
        tour.profileId != null ? (profileById.get(tour.profileId) ?? null) : null,
        vehicles,
      ),
    );
  }

  return { metricsByTourId, stopsByTourId };
}
