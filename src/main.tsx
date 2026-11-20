import { render } from "preact";
import { useState } from "preact/hooks";
import { holdOffUpdates, registerServiceWorker } from "./sw/register";
import { App } from "./ui/App";
import "./styles.css";

function Root() {
  const [handedOver, setHandedOver] = useState<string>();
  return <App key={handedOver === undefined ? "played" : "replayed"} handedOver={handedOver} onReplay={setHandedOver} />;
}

function start() {
  render(<Root />, document.getElementById("app")!);
  holdOffUpdates();
  registerServiceWorker();
}

const juliaMono = new FontFace("JuliaMono", "url('/fonts/JuliaMono-Regular.ttf')");
juliaMono.load().then(
  (font) => {
    document.fonts.add(font);
    start();
  },
  start,
);
