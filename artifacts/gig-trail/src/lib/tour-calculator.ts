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
  stopOrder: number;
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

export interface TourCalcResult {
  legs: TourLeg[];
  stopCalcs: StopCalc[];
  totalDistance: number;
  totalFuelUsedLitres: number;
  totalFuelCost: number;
  totalShowIncome: number;
  totalMerchIncome: number;
  grossIncome: number;
  /** Per-stop manual accommodation costs (stop-level entries) */
  totalStopAccommodation: number;
  /** Days-on-tour based accommodation estimate (from profile room settings) */
  tourAccommodationCost: number;
  /** Total accommodation = stopLevel + tourLevel */
  totalAccommodation: number;
  /** Number of nights implied by daysOnTour (daysOnTour - 1) */
  accommodationNights: number;
  totalMarketing: number;
  totalExtraCosts: number;
  totalExpenses: number;
  netProfit: number;
  avgPerShow: number;
  avgFuelPrice: number;
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

export function calculateTour(
  stops: TourStopInput[],
  startLocation: string | null | undefined,
  endLocation: string | null | undefined,
  returnHome: boolean,
  vehicleConsumptionLPer100: number | null | undefined,
  daysOnTour?: number | null,
  nightlyAccomRate?: number | null,
): TourCalcResult {
  const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
  const consumption = n(vehicleConsumptionLPer100);

  type LocationNode = { name: string; stop?: TourStopInput };
  const locations: LocationNode[] = [];
  if (startLocation?.trim()) locations.push({ name: startLocation.trim() });
  for (const stop of sortedStops) locations.push({ name: stop.city, stop });
  if (returnHome) {
    const dest = endLocation?.trim() || startLocation?.trim();
    if (dest) locations.push({ name: dest });
  }

  const legs: TourLeg[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i].name;
    const to = locations[i + 1].name;
    const destStop = locations[i + 1].stop;

    let distanceKm: number;
    let source: DistanceSource;

    if (destStop && n(destStop.distanceOverride) > 0) {
      distanceKm = n(destStop.distanceOverride);
      source = 'manual';
    } else {
      const est = estimateLegDistance(from, to);
      distanceKm = est.distanceKm;
      source = est.source;
    }

    const fuelPrice = getFuelPrice(to, destStop?.fuelPriceOverride);
    const fuelUsedLitres = consumption > 0 ? (distanceKm * consumption) / 100 : 0;
    const fuelCost = fuelUsedLitres * fuelPrice.pricePerLitre;

    legs.push({ from, to, distanceKm, source, fuelPrice, fuelUsedLitres, fuelCost });
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

  const totalDistance = legs.reduce((s, l) => s + l.distanceKm, 0);
  const totalFuelUsedLitres = legs.reduce((s, l) => s + l.fuelUsedLitres, 0);
  const totalFuelCost = legs.reduce((s, l) => s + l.fuelCost, 0);

  const totalShowIncome = stopCalcs.reduce((s, c) => s + c.showIncome, 0);
  const totalMerchIncome = stopCalcs.reduce((s, c) => s + c.merch, 0);
  const grossIncome = totalShowIncome + totalMerchIncome;

  const totalStopAccommodation = stopCalcs.reduce((s, c) => s + c.accommodation, 0);
  const totalMarketing = stopCalcs.reduce((s, c) => s + c.marketing, 0);
  const totalExtraCosts = stopCalcs.reduce((s, c) => s + c.extraCosts, 0);

  // Days-on-tour driven accommodation
  const days = n(daysOnTour);
  const accommodationNights = days > 0 ? Math.max(0, days - 1) : 0;
  const rate = n(nightlyAccomRate);
  const tourAccommodationCost = accommodationNights > 0 && rate > 0
    ? accommodationNights * rate
    : 0;

  const totalAccommodation = totalStopAccommodation + tourAccommodationCost;
  const totalExpenses = totalFuelCost + totalAccommodation + totalMarketing + totalExtraCosts;
  const netProfit = grossIncome - totalExpenses;
  const avgPerShow = sortedStops.length > 0 ? netProfit / sortedStops.length : 0;
  const avgFuelPrice = totalFuelUsedLitres > 0 ? totalFuelCost / totalFuelUsedLitres : 0;

  return {
    legs,
    stopCalcs,
    totalDistance,
    totalFuelUsedLitres,
    totalFuelCost,
    totalShowIncome,
    totalMerchIncome,
    grossIncome,
    totalStopAccommodation,
    tourAccommodationCost,
    totalAccommodation,
    accommodationNights,
    totalMarketing,
    totalExtraCosts,
    totalExpenses,
    netProfit,
    avgPerShow,
    avgFuelPrice,
  };
}

export function fmt(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
