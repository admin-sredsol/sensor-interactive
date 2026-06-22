import { createRoot } from "react-dom/client";
import App from "../components/app";

const rootElt = document.getElementById("app");
if (rootElt) {
  createRoot(rootElt).render(
    <App
      fakeSensor={true}
      displayType={"line"}
    />
  );
}
