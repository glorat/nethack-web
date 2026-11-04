import { homeAddress, lastMode } from "./port/modes";

// replace, so Back from either home doesn't come here to be sent on again
location.replace(homeAddress(lastMode() ?? "online"));
