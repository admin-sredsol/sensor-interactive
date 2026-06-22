import { createRoot } from "react-dom/client";
import App from "../components/app";
import { SensorConnectorManager } from "../models/sensor-connector-manager";

let sensorManager = new SensorConnectorManager();

const rootElt = document.getElementById("app");
if (rootElt) {
  createRoot(rootElt).render(
    <App
      sensorManager={sensorManager}
      displayType={"line"}
      />
  );
}