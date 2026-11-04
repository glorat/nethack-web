import { expect, test } from "vitest";
import { homeAddress, placeOf, playAddress, watchAddress } from "../../src/port/modes";

test("each mode's pages read back as that mode and page, with or without the trailing slash", () => {
  for (const mode of ["online", "offline"] as const) {
    expect(placeOf(homeAddress(mode))).toEqual({ mode, page: "home" });
    expect(placeOf(homeAddress(mode).slice(0, -1))).toEqual({ mode, page: "home" });
    expect(placeOf(playAddress(mode))).toEqual({ mode, page: "play" });
    expect(placeOf(playAddress(mode).slice(0, -1))).toEqual({ mode, page: "play" });
    expect(placeOf(watchAddress(mode))).toEqual({ mode, page: "watch" });
  }
});

test("an address outside both modes is neither", () => {
  for (const path of ["/", "/play/", "/onlinex/", "/online/other/", "/x/online/"]) expect(placeOf(path)).toBeNull();
});
