import { createRoot } from "react-dom/client";
import App from "../components/app";
import { SensorRecording } from "../interactive/types";

const recording: SensorRecording = {
  columnID: "100",
  sensorID: 0,
  unit: "m",
  precision: 2,
  name: 'Position',
  min: -20,
  max: 40,
  tareValue: 0,
  sensorPosition: 0,
  data: [
    [1,5],
    [2,-5],
    [3,10],
    [4,-10]
  ]
};

const preRecordedData:SensorRecording[] = [
  recording
];

const rootElt = document.getElementById("app");
if (rootElt) {
  createRoot(rootElt).render(
    <App
      preRecordings={preRecordedData}
      requirePrediction={true}
      fakeSensor={true}
      displayType={"line"}
      useAuthoredData={true}
      enablePause={true}
    />
  );
}
