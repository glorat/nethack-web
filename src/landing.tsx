import { render } from "preact";
import { registerServiceWorker } from "./sw/register";
import { Landing } from "./ui/Landing";
import "./styles.css";

render(<Landing />, document.getElementById("app")!);
registerServiceWorker();
