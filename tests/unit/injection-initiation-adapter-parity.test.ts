import { describe, expect, it } from "vitest";

import {
  mapLegacyInitiationProtocol as mapServerInitiationProtocol,
  type LegacyInitiationSnapshot,
} from "../../src/documentation/adapters/injection-initiation";
import { mapLegacyInitiationProtocol as mapBrowserInitiationProtocol } from "../../src/legacy/documentation-adapter";

const protocols = [
  "maintena-1day",
  "maintena-14day",
  "maintena-provider",
  "asimtufii-1day",
  "asimtufii-14day",
  "asimtufii-provider",
  "aristada-initio-sameday",
  "aristada-21day",
  "aristada-provider",
  "sustenna-day1",
  "sustenna-day8",
  "sustenna-provider",
] as const;

describe("server/browser injection initiation parity", () => {
  it.each(protocols)("preserves the %s initiation mapping", (protocol) => {
    const snapshot: LegacyInitiationSnapshot = {
      protocol,
      planVerified: true,
      oralStatus: "verified",
      providerNote: "Continue the provider-directed active order.",
      sustennaOrder: "standard",
      day1Date: "2026-08-23",
      second: {
        dose: "400 mg",
        site: "R deltoid",
        ndc: "00000-0000-00",
        lot: "LOT-2",
        exp: "2027-12",
        given: true,
        orderVerified: true,
        note: "Second component verified.",
      },
    };

    const argumentsForBoth = [
      snapshot,
      "Abilify Maintena",
      "2026-08-30",
      "14:35",
    ] as const;

    expect(mapServerInitiationProtocol(...argumentsForBoth)).toEqual(
      mapBrowserInitiationProtocol(...argumentsForBoth),
    );
  });
});
