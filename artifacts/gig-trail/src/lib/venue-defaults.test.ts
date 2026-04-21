import { describe, expect, it } from "vitest";
import { buildRunVenueDefaults, buildVenueDefaultDisplayRows } from "./venue-defaults";

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
      generalNotes: "Ask for early settlement.",
      venueStatus: "great",
      willPlayAgain: "yes",
      typicalSoundcheckTime: "17:00",
      typicalSetTime: "21:00",
      playingDays: ["thu", "fri", "sat"],
      accommodationAvailable: true,
      riderFriendly: true,
    });

    expect(defaults).toMatchObject({
      venueName: "The Tote",
      destination: "71 Johnston St, Collingwood VIC 3066",
      city: "Collingwood",
      state: "VIC",
      country: "Australia",
      capacity: 300,
      soundcheckTime: "17:00",
      playingTime: "21:00",
    });
    expect(defaults.accommodationRequired).toBeUndefined();
    expect(defaults.notes).toContain("Venue notes: Ask for early settlement.");
    expect(defaults.notes).toContain("Booking contact: Sam Booker");
    expect(defaults.notes).toContain("Production contact: Jo Sound");
    expect(defaults.notes).toContain("Playing days: thu, fri, sat");
    expect(defaults.notes).toContain("Venue default: rider friendly.");
  });

  it("formats venue defaults beside show overrides", () => {
    const rows = buildVenueDefaultDisplayRows(
      {
        venueName: "Northcote Social Club",
        capacity: 250,
        typicalSoundcheckTime: "16:30",
        accommodationAvailable: false,
        riderProvided: true,
        contactName: "Pat",
      },
      {
        capacity: 200,
        soundcheckTime: "17:00",
        accommodationRequired: true,
        notes: "Booking contact: Pat\nRider details confirmed.",
      },
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Capacity", venueDefault: "250", showOverride: "200" }),
        expect.objectContaining({ label: "Soundcheck", venueDefault: "16:30", showOverride: "17:00" }),
        expect.objectContaining({ label: "Rider", venueDefault: "Yes", showOverride: "In show notes" }),
      ]),
    );
  });

  it("keeps legacy venue field names compatible while building run defaults", () => {
    const defaults = buildRunVenueDefaults({
      venueName: "The Curtin",
      venueNotes: "Legacy note.",
      roomNotes: "Legacy room note.",
      riderProvided: true,
    });

    expect(defaults.notes).toContain("Venue notes: Legacy room note.");
    expect(defaults.notes).toContain("Venue default: rider friendly.");
  });
});
