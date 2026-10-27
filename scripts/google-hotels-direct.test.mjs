import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseEntityRate,
  encodeGoogleHotelsTs,
  parseGoogleHotelsEntity,
} from "./google-hotels-direct.mjs";

/* A trimmed version of the `ds:1` payload Google embeds in an entity page.
 * The positions mirror the live page: metadata on the root object, rate
 * sections under root[6], a full provider card with room variants under
 * section[16], and a compact provider card under section[2]. */
function entityHtml() {
  const parent = [];
  parent[1] = "Test Hotel";
  parent[2] = [[1.23, 4.56], [["1 Test Road"]]];
  parent[3] = ["4-star hotel", 4];
  parent[7] = [[4.5, 123]];
  parent[11] = ["A test hotel."];
  parent[6] = [];

  const fullOffer = [];
  fullOffer[0] = "Booking.com";
  fullOffer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
  fullOffer[18] = [
    "Free cancellation until Mar 1",
    "Free Wi-Fi",
    "Free breakfast",
    "2 guests",
  ];
  fullOffer[19] = ["$167", "$167", "$668", 167, 167];
  fullOffer[24] = [
    [
      "Heritage Room",
      ["1 double bed", "2 guests", "Free cancellation until Mar 1", "breakfast"],
      null,
      ["$167", "$167", "$668", 167, 167],
      "https://example.test/booking-2",
    ],
    [
      "Heritage Room",
      ["1 double bed", "3 guests", "Free cancellation until Mar 1", "breakfast"],
      null,
      ["$218", "$218", "$873", 218, 218],
      "https://example.test/booking-3",
    ],
  ];
  fullOffer[40] = 184;

  const compactOffer = [];
  compactOffer[0] = ["Priceline", 220, "https://example.test/priceline", null];
  compactOffer[12] = [];
  compactOffer[12][4] = ["$140", null, 140, null, 140];
  compactOffer[12][5] = ["$561", null, 561, null, 561];
  compactOffer[12][12] = [[2, null, 1], [1, "Mar 1", "11:59 PM", "3/1"]];

  parent[6][2] = [[[], [], [compactOffer]]];
  parent[6][16] = [[fullOffer]];

  const payload = JSON.stringify([parent]);
  return `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${payload}, sideChannel: {}});</script></body></html>`;
}

test("encodes the same Google Hotels ts as the live 1A1C page", () => {
  assert.equal(
    encodeGoogleHotelsTs({
      checkIn: "2027-03-05",
      checkOut: "2027-03-09",
      adults: 1,
      childAges: [8],
      rooms: 1,
      currency: "USD",
    }),
    "CAESDAoCCAMKBAgCEAgQABoiCgQKAhoAEhoSFAoHCOsPEAMYBRIHCOsPEAMYCRgEMgIIASoJCgU6A1VTRBoA",
  );
});

test("parses entity metadata and full room rates", () => {
  const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });

  assert.equal(entity.name, "Test Hotel");
  assert.equal(entity.address, "1 Test Road");
  assert.deepEqual(entity.coords, [1.23, 4.56]);
  assert.equal(entity.stars, 4);
  assert.equal(entity.rating, 4.5);
  assert.equal(entity.reviews, 123);

  const twoGuests = entity.rates.find(
    (rate) => rate.source === "Booking.com" && rate.guests === 2,
  );
  assert.ok(twoGuests, "expected the 2-guest Booking.com rate");
  assert.equal(twoGuests.room, "Heritage Room");
  assert.equal(twoGuests.total, 668);
  assert.equal(twoGuests.nightly, 167);
  assert.equal(twoGuests.breakfast, "included");
  assert.equal(twoGuests.cancellation, "Free cancellation until Mar 1");

  const threeGuests = entity.rates.find(
    (rate) => rate.source === "Booking.com" && rate.guests === 3,
  );
  assert.ok(threeGuests, "expected the 3-guest Booking.com rate");
  assert.equal(threeGuests.total, 873);
});

test("parses compact provider cards with unknown board and occupancy", () => {
  const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });
  const priceline = entity.rates.find((rate) => rate.source === "Priceline");

  assert.ok(priceline, "expected the compact Priceline rate");
  assert.equal(priceline.total, 561);
  assert.equal(priceline.nightly, 140);
  assert.equal(priceline.room, null);
  assert.equal(priceline.guests, null);
  assert.equal(priceline.breakfast, "unknown");
});

test("strict breakfast selection ignores cheaper room-only and unknown rates", () => {
  const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });

  const picked = chooseEntityRate(entity.rates, {
    requireBreakfast: true,
    partySize: 2,
  });
  assert.ok(picked);
  assert.equal(picked.total, 668);
  assert.equal(picked.breakfast, "included");

  const three = chooseEntityRate(entity.rates, {
    requireBreakfast: true,
    partySize: 3,
  });
  assert.ok(three);
  assert.equal(three.total, 873);

  const onlyCompact = entity.rates.filter((rate) => rate.source === "Priceline");
  assert.equal(
    chooseEntityRate(onlyCompact, { requireBreakfast: true, partySize: 2 }),
    null,
  );
});

test("normalises fractional entity totals and drops compact duplicates of a full rate", () => {
  // Rebuild the fixture with a fractional Booking.com compact card that
  // duplicates the full Booking.com room, plus a fractional Priceline card.
  const parent = [];
  parent[1] = "Test Hotel";
  parent[2] = [[1.23, 4.56], [["1 Test Road"]]];
  parent[3] = ["4-star hotel", 4];
  parent[7] = [[4.5, 123]];
  parent[6] = [];

  const fullOffer = [];
  fullOffer[0] = "Booking.com";
  fullOffer[1] = "//www.gstatic.com/travel-hotels/branding/icon_184.png";
  fullOffer[18] = ["Free cancellation until Mar 1", "Free breakfast", "2 guests"];
  fullOffer[19] = ["$167", "$167", "$668", 167, 167];
  fullOffer[24] = [
    [
      "Heritage Room",
      ["1 double bed", "2 guests", "Free cancellation until Mar 1", "breakfast"],
      null,
      ["$167", "$167", "$668", 167, 167],
      "https://example.test/booking-2",
    ],
  ];
  fullOffer[40] = 184;

  const duplicateBooking = [];
  duplicateBooking[0] = ["Booking.com", 184, "https://example.test/booking-compact", null];
  duplicateBooking[12] = [];
  duplicateBooking[12][4] = ["$167", null, 167.01562, null, 167];
  duplicateBooking[12][5] = ["$668", null, 668.0625, null, 668];
  duplicateBooking[12][12] = [[2, null, 1], [1, "Mar 1", "11:59 PM", "3/1"]];

  const priceline = [];
  priceline[0] = ["Priceline", 220, "https://example.test/priceline", null];
  priceline[12] = [];
  priceline[12][4] = ["$167", null, 167.01562, null, 167];
  priceline[12][5] = ["$668", null, 668.0625, null, 668];
  priceline[12][12] = [[2, null, 1], [1, "Mar 1", "11:59 PM", "3/1"]];

  parent[6][2] = [[[], [], [duplicateBooking, priceline]]];
  parent[6][16] = [[fullOffer]];

  const payload = JSON.stringify([parent]);
  const fractionalHtml = `<html><body><script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '6', data:${payload}, sideChannel: {}});</script></body></html>`;

  const entity = parseGoogleHotelsEntity(fractionalHtml, { nights: 4, currency: "USD" });
  const booking = entity.rates.filter((rate) => rate.source === "Booking.com");
  assert.equal(booking.length, 1, "compact duplicate should be dropped");
  assert.equal(booking[0].kind, "room");
  assert.equal(booking[0].total, 668);
  assert.equal(booking[0].nightly, 167);

  const pricelineRate = entity.rates.find((rate) => rate.source === "Priceline");
  assert.ok(pricelineRate);
  assert.equal(pricelineRate.total, 668);
  assert.equal(pricelineRate.nightly, 167);

  for (const rate of entity.rates) {
    assert.ok(Number.isInteger(rate.total), `${rate.source} total should be a whole unit`);
    assert.ok(
      rate.nightly == null || Number.isInteger(rate.nightly),
      `${rate.source} nightly should be a whole unit`,
    );
  }
});

test("loose selection can use an unknown-board rate when explicitly allowed", () => {
  const entity = parseGoogleHotelsEntity(entityHtml(), { nights: 4, currency: "USD" });
  const picked = chooseEntityRate(entity.rates, {
    requireBreakfast: false,
    partySize: 2,
    allowUnknownOccupancy: true,
  });

  assert.ok(picked);
  assert.equal(picked.total, 561);
});
