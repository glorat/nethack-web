import { activity } from "./activity";
import { depths } from "./depths";
import { encumbrance } from "./encumbrance";
import { end } from "./end";
import type { Metric } from "./metric";
import { messages } from "./messages";
import { nymphEncounters } from "./nymph-encounters";
import { nymphs } from "./nymphs";
import { positions } from "./positions";
import { regrets } from "./regrets";
import { stalls } from "./stalls";

/** The metrics that use only what the player could see. */
export const METRICS: Metric[] = [depths, end, stalls, regrets, activity, encumbrance, positions, messages, nymphs, nymphEncounters];
