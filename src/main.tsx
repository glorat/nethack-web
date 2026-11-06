import { render } from "preact";
import { useState } from "preact/hooks";
import { holdOffUpdates, registerServiceWorker } from "./sw/register";
import { App } from "./ui/App";
import { startDiagnostics } from "./ui/diagnostics";
import "./styles.css";

function Root() {
  const [handedOver, setHandedOver] = useState<string>();
  return <App key={handedOver === undefined ? "played" : "replayed"} handedOver={handedOver} onReplay={setHandedOver} />;
}

render(<Root />, document.getElementById("app")!);
startDiagnostics();
holdOffUpdates();
registerServiceWorker();
