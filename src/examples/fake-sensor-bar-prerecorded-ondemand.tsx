import { createRoot } from "react-dom/client";
import App from "../components/app";
import { SensorRecording } from "../interactive/types";

const recording: SensorRecording = {
  columnID: "100",
  sensorID: 0,
  unit: "degC",
  precision: 2,
  name: 'Temperature',
  min: 0,
  max: 40,
  tareValue: 0,
  sensorPosition: 0,
  data: [
    [1,10],
    [2,20],
    [3,30]
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
      fakeSensor={true}
      displayType={"bar"}
      singleReads={true}
    />
  );
}
