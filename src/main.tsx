import { render } from "preact";
import { useState } from "preact/hooks";
import { holdOffUpdates, registerServiceWorker } from "./sw/register";
import { App } from "./ui/App";
import "./styles.css";

function Root() {
  const [handedOver, setHandedOver] = useState<string>();
  return <App key={handedOver === undefined ? "played" : "replayed"} handedOver={handedOver} onReplay={setHandedOver} />;
}

// the ASCII map's last resort for characters its font lacks, fetched once the map asks for it; the map redraws when it comes
document.fonts.add(new FontFace("JuliaMono", `url("${import.meta.env.BASE_URL}fonts/JuliaMono-Regular.ttf")`));
render(<Root />, document.getElementById("app")!);
holdOffUpdates();
registerServiceWorker();
