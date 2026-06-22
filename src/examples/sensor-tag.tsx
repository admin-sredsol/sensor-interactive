import { createRoot } from "react-dom/client";
import App from "../components/app";
import { SensorTagManager } from "../models/sensor-tag-manager";

let sensorManager = new SensorTagManager();

// We should add the connect button above the App
// Button was: className="zero-button side-panel-item"
const rootElt = document.getElementById("app");
if (rootElt) {
  createRoot(rootElt).render(
    <App
      sensorManager={sensorManager}
      displayType={"line"}
    />
  );
}
