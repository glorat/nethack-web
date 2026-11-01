import { render } from "preact";
import { loadServer } from "./server/load";
import { holdOffUpdates, registerServiceWorker } from "./sw/register";
import { App } from "./ui/App";
import "./styles.css";

render(<App />, document.getElementById("app")!);
holdOffUpdates();
registerServiceWorker();
void loadServer();
