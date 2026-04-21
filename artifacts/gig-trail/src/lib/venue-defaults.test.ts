import { describe, expect, it } from "vitest";
import { buildRunVenueDefaults, stripVenueOutcomeFields } from "./venue-defaults";

describe("venue defaults", () => {
  it("prefills run creation from venue identity and booking defaults", () => {
    const defaults = buildRunVenueDefaults({
      venueName: "The Tote",
      fullAddress: "71 Johnston St, Collingwood VIC 3066",
      suburb: "Collingwood",
      city: "Melbourne",
      state: "VIC",
      country: "Australia",
      capacity: 300,
      contactName: "Sam Booker",
      productionContactName: "Jo Sound",
      roomNotes: "Load in from the side door.",
      venueNotes: "Ask for early settlement.",
      venueStatus: "great",
      willPlayAgain: "yes",
      playingDays: ["thu", "fri", "sat"],
      accommodationAvailable: true,
      riderProvided: true,
    });

    expect(defaults).toMatchObject({
      venueName: "The Tote",
      destination: "71 Johnston St, Collingwood VIC 3066",
      city: "Collingwood",
      state: "VIC",
      country: "Australia",
      capacity: 300,
      accommodationRequired: false,
    });
    expect(defaults.notes).toContain("Room notes: Load in from the side door.");
    expect(defaults.notes).toContain("Booking contact: Sam Booker");
    expect(defaults.notes).toContain("Production contact: Jo Sound");
    expect(defaults.notes).toContain("Venue status: great");
    expect(defaults.notes).toContain("Playing days: thu, fri, sat");
    expect(defaults.notes).toContain("Venue default: rider provided.");
  });

  it("does not copy actual ticket sales into venue payloads", () => {
    const venuePayload = stripVenueOutcomeFields({
      venueName: "Northcote Social Club",
      playingDays: ["thu", "fri", "sat"],
      actualTicketSales: 180,
    });

    expect(venuePayload).toEqual({
      venueName: "Northcote Social Club",
      playingDays: ["thu", "fri", "sat"],
    });
    expect(venuePayload).not.toHaveProperty("actualTicketSales");
  });
});
