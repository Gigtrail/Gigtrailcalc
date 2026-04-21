/**
 * Venue map item DTO for Tour View. Manually maintained to mirror the OpenAPI spec.
 */
export interface VenueMapItem {
  id: number;
  venueName: string;
  city: string | null;
  state: string | null;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  upcomingShowsCount: number;
  pastShowsCount: number;
}
