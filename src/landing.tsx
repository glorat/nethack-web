import { render } from "preact";
import { diagnosticsWanted } from "./ui/diagnostics";
import { Landing } from "./ui/Landing";
import "./styles.css";

render(<Landing />, document.getElementById("app")!);
diagnosticsWanted();
