/**
 * Tour item DTO. Manually maintained to mirror the OpenAPI spec.
 */

export type TourItemType = "run" | "tour_stop";
export type TourItemStatus = "draft" | "pitched" | "confirmed" | "cancelled";

export interface TourItem {
  id: string;
  sourceId: number;
  type: TourItemType;
  showDate: string;
  venueName: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: TourItemStatus;
  tourId: number | null;
  tourName: string | null;
  tourStartDate: string | null;
  tourEndDate: string | null;
  tourOrderIndex: number | null;
  linkPath: string;
}
