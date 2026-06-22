import { createRoot } from "react-dom/client";
import { AppComponent } from "./app";

import "./index.css";

const rootElt = document.getElementById("app");
if (rootElt) {
  createRoot(rootElt).render(<AppComponent />);
}
