import { estimateLegDistance, type RouteLeg, type DistanceSource } from './routing-service';
import { getFuelPrice, type FuelPriceResult } from './fuel-service';

export type { DistanceSource, FuelPriceResult };

function n(val: unknown): number {
  const num = parseFloat(String(val ?? 0));
  return Number.isNaN(num) ? 0 : num;
}

export interface TourStopInput {
  id: number;
  city: string;
  cityLat?: number | null;
  cityLng?: number | null;
  stopOrder: number;
  date?: string | null;
  showType: string;
  fee?: number | null;
  capacity?: number | null;
  ticketPrice?: number | null;
  expectedAttendancePct?: number | null;
  dealType?: string | null;
  splitPct?: number | null;
  guarantee?: number | null;
  merchEstimate?: number | null;
  marketingCost?: number | null;
  accommodationCost?: number | null;
  accommodationMode?: string | null;
  extraCosts?: number | null;
  distanceOverride?: number | null;
  fuelPriceOverride?: number | null;
}

export interface TourLeg extends RouteLeg {
  fuelPrice: FuelPriceResult;
  fuelUsedLitres: number;
  fuelCost: number;
}

export interface StopCalc {
  stopId: number;
  city: string;
  showIncome: number;
  merch: number;
  totalIncome: number;
  accommodation: number;
  marketing: number;
  extraCosts: number;
  totalCosts: number;
  net: number;
}

export interface BlankDay {
  date: string;
}

/** One slot per calendar day of the tour */
export interface DaySlot {
  date: string;
  dayNumber: number;
  stop?: TourStopInput;
  /** Drive leg arriving at this day's show (undefined for blank days) */
  incomingLeg?: TourLeg;
  dailyFoodCost: number;
  /** Accom cost for this day: 0 if venue-provided or accom not required */
  dailyAccomCost: number;
  dailyTotalCost: number;
  accomCoveredByVenue: boolean;
}

export interface VehicleInput {
  id: number;
  name: string;
  fuelType: string;
  avgConsumption: number;
}

export interface VehicleFuelBreakdown {
  vehicleId: number;
  vehicleName: string;
  fuelType: string;
  consumptionLPer100: number;
  totalLitres: number;
  totalCost: number;
}

export interface TourCalcResult {
  legs: TourLeg[];
  stopCalcs: StopCalc[];
  blankDays: BlankDay[];
  daySlots: DaySlot[];
  totalDistance: number;
  totalDriveTimeMinutes: number;
  totalFuelUsedLitres: number;
  totalFuelCost: number;
  totalShowIncome: number;
  totalMerchIncome: number;
  grossIncome: number;
  /** Per-stop manual accommodation costs (show nights, set when stop was added) */
  totalStopAccommodation: number;
  /** Profile-based accommodation cost for blank days only */
  blankDayAccomCost: number;
  /** Total accommodation = stopLevel + blankDayAccomCost */
  totalAccommodation: number;
  /** @deprecated use blankDayAccomCost; kept for compatibility */
  tourAccommodationCost: number;
  /** Number of blank (non-show) days in the tour range */
  accommodationNights: number;
  /** Total food cost across all tour days (profileFoodPerDay × totalDays) */
  totalFoodCost: number;
  totalMarketing: number;
  totalExtraCosts: number;
  totalExpenses: number;
  netProfit: number;
  avgPerShow: number;
  avgFuelPrice: number;
  showDays: number;
  blankDayCount: number;
  /** Per-vehicle fuel usage breakdown (populated when vehicles array is passed) */
  vehicleFuelBreakdown: VehicleFuelBreakdown[];
}

function getISODate(str: string | null | undefined): string | null {
  if (!str) return null;
  return str.split('T')[0];
}

function detectBlankDays(
  sortedStops: TourStopInput[],
  startDate?: string | null,
  endDate?: string | null,
): BlankDay[] {
  const showDates = new Set<string>();
  for (const s of sortedStops) {
    const d = getISODate(s.date);
    if (d) showDates.add(d);
  }

  const allShowDates = [...showDates].sort();
  if (allShowDates.length === 0 && !startDate && !endDate) return [];

  const rangeStart = getISODate(startDate) ?? allShowDates[0] ?? null;
  const rangeEnd = getISODate(endDate) ?? allShowDates[allShowDates.length - 1] ?? null;
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];

  const blanks: BlankDay[] = [];
  const cur = new Date(rangeStart + 'T00:00:00Z');
  const end = new Date(rangeEnd + 'T00:00:00Z');

  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    if (!showDates.has(d)) blanks.push({ date: d });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return blanks;
}

function buildDaySlots(
  sortedStops: TourStopInput[],
  legs: TourLeg[],
  startDate: string,
  endDate: string,
  hasStartLocation: boolean,
  foodPerDay: number,
  accomRequired: boolean,
  nightlyAccomRate: number,
  routeIndexByStopId: Map<number, number>,
): DaySlot[] {
  const stopByDate = new Map<string, { stop: TourStopInput; routeIndex: number }>();
  for (const stop of sortedStops) {
    const d = getISODate(stop.date);
    const ri = routeIndexByStopId.get(stop.id);
    if (d && ri !== undefined) stopByDate.set(d, { stop, routeIndex: ri });
  }

  const slots: DaySlot[] = [];
  const cur = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  let dayNum = 1;

  while (cur <= end) {
    const date = cur.toISOString().split('T')[0];
    const entry = stopByDate.get(date);

    let incomingLeg: TourLeg | undefined;
    if (entry) {
      const legIndex = hasStartLocation ? entry.routeIndex : entry.routeIndex - 1;
      if (legIndex >= 0 && legIndex < legs.length) {
        incomingLeg = legs[legIndex];
      }
    }

    const accomCoveredByVenue = entry?.stop.accommodationMode === 'venue_provided';

    let dailyAccomCost: number;
    if (!accomRequired) {
      dailyAccomCost = 0;
    } else if (entry) {
      dailyAccomCost = accomCoveredByVenue ? 0 : n(entry.stop.accommodationCost);
    } else {
      dailyAccomCost = nightlyAccomRate;
    }

    slots.push({
      date,
      dayNumber: dayNum,
      stop: entry?.stop,
      incomingLeg,
      dailyFoodCost: foodPerDay,
      dailyAccomCost,
      dailyTotalCost: foodPerDay + dailyAccomCost,
      accomCoveredByVenue,
    });

    dayNum++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return slots;
}

export function calcShowIncome(stop: TourStopInput): number {
  if (stop.showType === 'Flat Fee') {
    return n(stop.fee);
  }

  const capacity = n(stop.capacity);
  const attendancePct = n(stop.expectedAttendancePct);
  const ticketPrice = n(stop.ticketPrice);
  const splitPct = n(stop.splitPct);
  const guarantee = n(stop.guarantee);

  const expectedSold = Math.floor((capacity * attendancePct) / 100);
  const grossRevenue = expectedSold * ticketPrice;

  let doorIncome = 0;
  if (stop.dealType === '100% door') {
    doorIncome = grossRevenue;
  } else if (stop.dealType === 'percentage split') {
    doorIncome = grossRevenue * (splitPct / 100);
  } else if (stop.dealType === 'guarantee vs door') {
    doorIncome = Math.max(guarantee, grossRevenue * (splitPct / 100));
  }

  if (stop.showType === 'Hybrid') {
    return n(stop.guarantee) + doorIncome;
  }

  return doorIncome;
}

export function formatDriveTime(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function calculateTour(
  stops: TourStopInput[],
  startLocation: string | null | undefined,
  endLocation: string | null | undefined,
  returnHome: boolean,
  vehicleConsumptionLPer100: number | null | undefined,
  daysOnTour?: number | null,
  nightlyAccomRate?: number | null,
  startDate?: string | null,
  endDate?: string | null,
  profileFoodPerDay?: number | null,
  profileAccomRequired?: boolean | null,
  vehicles?: VehicleInput[] | null,
  startLocationLat?: number | null,
  startLocationLng?: number | null,
  endLocationLat?: number | null,
  endLocationLng?: number | null,
): TourCalcResult {
  const sortedStops = [...stops].sort((a, b) => {
    const da = getISODate(a.date);
    const db = getISODate(b.date);
    if (da && db && da !== db) return da < db ? -1 : 1;
    return a.stopOrder - b.stopOrder;
  });

  const fleetVehicles = vehicles && vehicles.length > 0 ? vehicles : null;
  const consumption = fleetVehicles
    ? fleetVehicles.reduce((s, v) => s + n(v.avgConsumption), 0)
    : n(vehicleConsumptionLPer100);

  type LocationNode = { name: string; lat?: number | null; lng?: number | null; stop?: TourStopInput };
  const locations: LocationNode[] = [];
  if (startLocation?.trim()) locations.push({ name: startLocation.trim(), lat: startLocationLat, lng: startLocationLng });
  const validStops = sortedStops.filter(s => s.city?.trim());
  for (const stop of validStops) locations.push({ name: stop.city, lat: stop.cityLat, lng: stop.cityLng, stop });
  if (returnHome) {
    const dest = endLocation?.trim() || startLocation?.trim();
    if (dest) {
      const destLat = endLocation?.trim() ? endLocationLat : startLocationLat;
      const destLng = endLocation?.trim() ? endLocationLng : startLocationLng;
      locations.push({ name: dest, lat: destLat, lng: destLng });
    }
  }

  const legs: TourLeg[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i].name;
    const to = locations[i + 1].name;
    const destStop = locations[i + 1].stop;
    const srcNode = locations[i];
    const dstNode = locations[i + 1];

    let distanceKm: number;
    let driveTimeMinutes: number;
    let source: DistanceSource;

    if (destStop && n(destStop.distanceOverride) > 0) {
      distanceKm = n(destStop.distanceOverride);
      driveTimeMinutes = Math.round((distanceKm / 80) * 60);
      source = 'manual';
    } else {
      const est = estimateLegDistance(from, to, srcNode.lat, srcNode.lng, dstNode.lat, dstNode.lng);
      distanceKm = est.distanceKm;
      driveTimeMinutes = est.driveTimeMinutes;
      source = est.source;
    }

    const fuelPrice = getFuelPrice(to, destStop?.fuelPriceOverride);
    const fuelUsedLitres = consumption > 0 ? (distanceKm * consumption) / 100 : 0;
    const fuelCost = fuelUsedLitres * fuelPrice.pricePerLitre;

    legs.push({ from, to, distanceKm, driveTimeMinutes, source, fuelPrice, fuelUsedLitres, fuelCost });
  }

  const stopCalcs: StopCalc[] = sortedStops.map(stop => {
    const showIncome = calcShowIncome(stop);
    const merch = n(stop.merchEstimate);
    const accommodation = n(stop.accommodationCost);
    const marketing = n(stop.marketingCost);
    const extraCosts = n(stop.extraCosts);
    return {
      stopId: stop.id,
      city: stop.city,
      showIncome,
      merch,
      totalIncome: showIncome + merch,
      accommodation,
      marketing,
      extraCosts,
      totalCosts: accommodation + marketing + extraCosts,
      net: showIncome + merch - accommodation - marketing - extraCosts,
    };
  });

  const blankDays = detectBlankDays(sortedStops, startDate, endDate);

  const showDates = new Set<string>();
  for (const s of sortedStops) {
    const d = getISODate(s.date);
    if (d) showDates.add(d);
  }
  const showDays = showDates.size;
  const blankDayCount = blankDays.length;

  const totalDistance = legs.reduce((s, l) => s + l.distanceKm, 0);
  const totalDriveTimeMinutes = legs.reduce((s, l) => s + l.driveTimeMinutes, 0);
  const totalFuelUsedLitres = legs.reduce((s, l) => s + l.fuelUsedLitres, 0);
  const totalFuelCost = legs.reduce((s, l) => s + l.fuelCost, 0);

  const totalShowIncome = stopCalcs.reduce((s, c) => s + c.showIncome, 0);
  const totalMerchIncome = stopCalcs.reduce((s, c) => s + c.merch, 0);
  const grossIncome = totalShowIncome + totalMerchIncome;

  const totalStopAccommodation = stopCalcs.reduce((s, c) => s + c.accommodation, 0);
  const totalMarketing = stopCalcs.reduce((s, c) => s + c.marketing, 0);
  const totalExtraCosts = stopCalcs.reduce((s, c) => s + c.extraCosts, 0);

  const rangeStart = getISODate(startDate);
  const rangeEnd = getISODate(endDate);
  const hasStartLocation = !!startLocation?.trim();
  const foodPerDay = n(profileFoodPerDay);
  const accomRequired = profileAccomRequired ?? false;
  const rate = n(nightlyAccomRate);

  const routeIndexByStopId = new Map<number, number>();
  for (let i = 0; i < validStops.length; i++) {
    routeIndexByStopId.set(validStops[i].id, i);
  }

  const daySlots =
    rangeStart && rangeEnd && rangeStart <= rangeEnd
      ? buildDaySlots(sortedStops, legs, rangeStart, rangeEnd, hasStartLocation, foodPerDay, accomRequired, rate, routeIndexByStopId)
      : [];

  const totalFoodCost = daySlots.reduce((s, d) => s + d.dailyFoodCost, 0);

  let blankDayAccomCost: number;
  let accommodationNights: number;

  if (daySlots.length > 0) {
    const blankSlots = daySlots.filter(d => !d.stop);
    blankDayAccomCost = blankSlots.reduce((s, d) => s + d.dailyAccomCost, 0);
    accommodationNights = blankSlots.length;
  } else {
    const days = n(daysOnTour);
    accommodationNights = days > 0 ? Math.max(0, days - 1) : 0;
    blankDayAccomCost = accommodationNights > 0 && rate > 0 ? accommodationNights * rate : 0;
  }

  const totalAccommodation = totalStopAccommodation + blankDayAccomCost;

  const totalExpenses = totalFuelCost + totalAccommodation + totalFoodCost + totalMarketing + totalExtraCosts;
  const netProfit = grossIncome - totalExpenses;
  const avgPerShow = sortedStops.length > 0 ? netProfit / sortedStops.length : 0;
  const avgFuelPrice = totalFuelUsedLitres > 0 ? totalFuelCost / totalFuelUsedLitres : 0;

  const vehicleFuelBreakdown: VehicleFuelBreakdown[] = fleetVehicles
    ? fleetVehicles.map(v => {
        const vConsumption = n(v.avgConsumption);
        const vTotalLitres = vConsumption > 0 ? (totalDistance * vConsumption) / 100 : 0;
        const vTotalCost = vTotalLitres * avgFuelPrice;
        return {
          vehicleId: v.id,
          vehicleName: v.name,
          fuelType: v.fuelType,
          consumptionLPer100: vConsumption,
          totalLitres: vTotalLitres,
          totalCost: vTotalCost,
        };
      })
    : [];

  return {
    legs,
    stopCalcs,
    blankDays,
    daySlots,
    totalDistance,
    totalDriveTimeMinutes,
    totalFuelUsedLitres,
    totalFuelCost,
    totalShowIncome,
    totalMerchIncome,
    grossIncome,
    totalStopAccommodation,
    blankDayAccomCost,
    totalAccommodation,
    tourAccommodationCost: blankDayAccomCost,
    accommodationNights,
    totalFoodCost,
    totalMarketing,
    totalExtraCosts,
    totalExpenses,
    netProfit,
    avgPerShow,
    avgFuelPrice,
    showDays,
    blankDayCount,
    vehicleFuelBreakdown,
  };
}

export function fmt(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
