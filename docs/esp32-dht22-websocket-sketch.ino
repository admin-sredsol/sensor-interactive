/**
 * ESP32 DHT22 WebSocket Sensor — Reference Firmware
 * 
 * This sketch implements the WebSocket protocol expected by BLESensorManager
 * in WebSocket mode. It reads temperature and humidity from a DHT22 sensor
 * and streams data via WebSocket in JSON format.
 * 
 * The ESP32 creates a WiFi Access Point (AP mode) and runs a WebSocket server
 * on port 81. Clients connect to ws://192.168.4.1:81.
 * 
 * WebSocket Protocol:
 *   - On connection, server sends device_info JSON
 *   - Client sends command JSON (start, stop, set_period, get_info)
 *   - Server sends data JSON notifications during collection
 * 
 * Data format (JSON over WebSocket):
 *   {"type":"data","time":1.23,"channels":{"100":25.4,"101":60.2}}
 * 
 * Command format (JSON from client):
 *   {"type":"command","action":"start","period_ms":2000}
 *   {"type":"command","action":"stop"}
 *   {"type":"command","action":"get_info"}
 * 
 * Device info format (JSON sent on connection):
 *   {"type":"device_info","name":"ESP32-DHT22","firmware":"1.0.0",
 *    "sensors":[{"id":"100","name":"Temperature","units":"°C"},
 *               {"id":"101","name":"Humidity","units":"%"}],
 *    "defaultPeriodMs":2000,"supportsDualCollection":true}
 * 
 * Wiring:
 *   DHT22 data pin → GPIO 4 (with 10kΩ pull-up to 3.3V)
 * 
 * Dependencies:
 *   - ESP32 Arduino core (includes WiFi and WebSockets libraries)
 *   - DHT sensor library (install via Library Manager: "DHT sensor library")
 *   - WebSockets library (install via Library Manager: "WebSockets by Markus Sattel")
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT22

// WiFi AP credentials
const char* ap_ssid = "ESP32-Sensor";
const char* ap_password = "12345678";

// WebSocket server port (must match BLESensorManager default)
const int ws_port = 81;

DHT dht(DHTPIN, DHTTYPE);
WebSocketsServer wsServer = WebSocketsServer(ws_port);

bool isCollecting = false;
unsigned long lastReadTime = 0;
int periodMs = 2000;  // Default: DHT22 max ~0.5 Hz
unsigned long startTime = 0;

// ─── Device Info JSON ───
// Sent to client on connection or when get_info command is received.
const char* deviceInfoJson = "{\"type\":\"device_info\","
  "\"name\":\"ESP32-DHT22\","
  "\"firmware\":\"1.0.0\","
  "\"sensors\":["
    "{\"id\":\"100\",\"name\":\"Temperature\",\"units\":\"°C\"},"
    "{\"id\":\"101\",\"name\":\"Humidity\",\"units\":\"%\"}"
  "],"
  "\"defaultPeriodMs\":2000,"
  "\"supportsDualCollection\":true}";

// ─── WebSocket Event Handler ───

void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client %u disconnected\n", num);
      // Stop collection if the collecting client disconnects
      isCollecting = false;
      break;

    case WStype_CONNECTED: {
      IPAddress ip = wsServer.remoteIP(num);
      Serial.printf("[WS] Client %u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      // Send device info on connection
      wsServer.sendTXT(num, deviceInfoJson);
      break;
    }

    case WStype_TEXT: {
      String message = String((char*)payload);
      Serial.printf("[WS] Received: %s\n", (char*)payload);

      // Parse command
      if (message.indexOf("\"start\"") >= 0) {
        isCollecting = true;
        startTime = millis();
        Serial.println("[ESP32] Collection started");

        // Parse period_ms if present
        int periodIdx = message.indexOf("period_ms");
        if (periodIdx >= 0) {
          int colonIdx = message.indexOf(":", periodIdx);
          if (colonIdx >= 0) {
            String numStr = message.substring(colonIdx + 1);
            numStr.trim();
            if (numStr.endsWith("}")) {
              numStr = numStr.substring(0, numStr.length() - 1);
            }
            int newPeriod = numStr.toInt();
            if (newPeriod > 0) {
              periodMs = newPeriod;
              Serial.printf("[ESP32] Period set to %d ms\n", periodMs);
            }
          }
        }
      } else if (message.indexOf("\"stop\"") >= 0) {
        isCollecting = false;
        Serial.println("[ESP32] Collection stopped");
      } else if (message.indexOf("\"get_info\"") >= 0) {
        wsServer.sendTXT(num, deviceInfoJson);
        Serial.println("[ESP32] Sent device info");
      }
      break;
    }

    default:
      break;
  }
}

// ─── Setup ───

void setup() {
  Serial.begin(115200);
  Serial.println("[ESP32] DHT22 WebSocket Sensor starting...");

  dht.begin();

  // Start WiFi Access Point
  WiFi.softAP(ap_ssid, ap_password);
  IPAddress ip = WiFi.softAPIP();
  Serial.printf("[ESP32] AP started. SSID: %s, Password: %s\n", ap_ssid, ap_password);
  Serial.printf("[ESP32] WebSocket server at ws://%d.%d.%d.%d:%d\n", ip[0], ip[1], ip[2], ip[3], ws_port);

  // Start WebSocket server
  wsServer.begin();
  wsServer.onEvent(webSocketEvent);
  Serial.println("[ESP32] WebSocket server started");
}

// ─── Main Loop ───

void loop() {
  wsServer.loop();

  if (!isCollecting) {
    return;
  }

  unsigned long now = millis();
  if (now - lastReadTime < (unsigned long)periodMs) {
    return;
  }
  lastReadTime = now;

  // Read sensor values
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  // Check for read failures
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[ESP32] DHT22 read failed, retrying...");
    return;
  }

  // Calculate elapsed time in seconds
  float elapsed = (now - startTime) / 1000.0;

  // Build JSON data packet
  char json[256];
  snprintf(json, sizeof(json),
    "{\"type\":\"data\",\"time\":%.2f,\"channels\":{\"100\":%.1f,\"101\":%.1f}}",
    elapsed, temp, hum);

  // Send to all connected WebSocket clients
  wsServer.broadcastTXT(json);

  Serial.printf("[ESP32] Sent: temp=%.1f°C, hum=%.1f%% (t=%.2fs)\n", temp, hum, elapsed);
}