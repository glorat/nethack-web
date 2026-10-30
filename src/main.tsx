import { render } from "preact";
import { registerServiceWorker } from "./sw/register";
import { App } from "./ui/App";
import "./styles.css";

render(<App />, document.getElementById("app")!);
registerServiceWorker();
