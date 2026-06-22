/**
 * ESP32 DHT22 BLE Sensor — Reference Firmware
 * 
 * This sketch implements the BLE protocol expected by BLESensorManager.
 * It reads temperature and humidity from a DHT22 sensor and streams
 * data via BLE notifications in JSON format.
 * 
 * BLE Service/Characteristic UUIDs:
 *   Service:    4fafc201-1fb5-459e-8fcc-c5c9c331914b
 *   Config:     beb5483e-36e1-4688-b7f5-ea07361b26a8 (write)
 *   Data:       1c95d598-a761-4f1e-8ca1-7b4a3f7e9eb1 (notify)
 *   Device Info: 8bdf0e1a-0fde-4c7d-8a6e-5d3e9f1a2b4c (read)
 * 
 * Data format (JSON over BLE notifications):
 *   {"type":"data","time":1.23,"channels":{"100":25.4,"101":60.2}}
 * 
 * Command format (JSON written to config characteristic):
 *   {"type":"command","action":"start","period_ms":2000}
 *   {"type":"command","action":"stop"}
 * 
 * Wiring:
 *   DHT22 data pin → GPIO 4 (with 10kΩ pull-up to 3.3V)
 * 
 * Dependencies:
 *   - ESP32 Arduino core (includes BLE library)
 *   - DHT sensor library (install via Library Manager: "DHT sensor library")
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT22

// BLE UUIDs — must match esp32-device-profiles.ts
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CONFIG_UUID         "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define DATA_UUID           "1c95d598-a761-4f1e-8ca1-7b4a3f7e9eb1"
#define INFO_UUID           "8bdf0e1a-0fde-4c7d-8a6e-5d3e9f1a2b4c"

DHT dht(DHTPIN, DHTTYPE);

BLEServer* pServer = nullptr;
BLECharacteristic* pDataCharacteristic = nullptr;
BLECharacteristic* pConfigCharacteristic = nullptr;
BLECharacteristic* pInfoCharacteristic = nullptr;

bool isCollecting = false;
unsigned long lastReadTime = 0;
int periodMs = 2000;  // Default: DHT22 max ~0.5 Hz
unsigned long startTime = 0;
bool deviceConnected = false;

// ─── Config Characteristic Callbacks ───

class ConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String value = pCharacteristic->getValue().c_str();
    
    // Parse JSON command
    if (value.indexOf("\"start\"") >= 0) {
      isCollecting = true;
      startTime = millis();
      Serial.println("[ESP32] Collection started");
    } 
    else if (value.indexOf("\"stop\"") >= 0) {
      isCollecting = false;
      Serial.println("[ESP32] Collection stopped");
    }
    
    // Parse period_ms if present
    int periodIdx = value.indexOf("period_ms");
    if (periodIdx >= 0) {
      // Extract the number after "period_ms":
      int colonIdx = value.indexOf(":", periodIdx);
      if (colonIdx >= 0) {
        String numStr = value.substring(colonIdx + 1);
        // Trim trailing } and whitespace
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
  }
};

// ─── Server Callbacks (connection/disconnection) ───

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    Serial.println("[ESP32] Client connected");
  }

  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    isCollecting = false;
    Serial.println("[ESP32] Client disconnected");
    // Restart advertising so clients can find us again
    BLEDevice::startAdvertising();
  }
};

// ─── Setup ───

void setup() {
  Serial.begin(115200);
  Serial.println("[ESP32] DHT22 BLE Sensor starting...");
  
  dht.begin();

  // Initialize BLE
  BLEDevice::init("ESP32-DHT22");
  
  // Create server with connection callbacks
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  // Create service
  BLEService* pService = pServer->createService(SERVICE_UUID);

  // Data characteristic (notify)
  pDataCharacteristic = pService->createCharacteristic(
    DATA_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pDataCharacteristic->addDescriptor(new BLE2902());

  // Config characteristic (write)
  pConfigCharacteristic = pService->createCharacteristic(
    CONFIG_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  pConfigCharacteristic->setCallbacks(new ConfigCallbacks());

  // Device info characteristic (read)
  pInfoCharacteristic = pService->createCharacteristic(
    INFO_UUID,
    BLECharacteristic::PROPERTY_READ
  );
  
  // Set device info JSON — must match the format expected by resolveDeviceProfile()
  String info = "{\"type\":\"device_info\","
                "\"name\":\"ESP32-DHT22\","
                "\"firmware\":\"1.0.0\","
                "\"sensors\":["
                  "{\"id\":\"100\",\"name\":\"Temperature\",\"units\":\"°C\"},"
                  "{\"id\":\"101\",\"name\":\"Humidity\",\"units\":\"%\"}"
                "],"
                "\"defaultPeriodMs\":2000,"
                "\"supportsDualCollection\":true}";
  pInfoCharacteristic->setValue(info.c_str());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
  
  Serial.println("[ESP32] BLE service started, advertising...");
}

// ─── Main Loop ───

void loop() {
  if (!deviceConnected || !isCollecting) {
    delay(10);
    return;
  }

  unsigned long now = millis();
  if (now - lastReadTime < (unsigned long)periodMs) {
    delay(10);
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
  // Format: {"type":"data","time":<seconds>,"channels":{"100":<temp>,"101":<humidity>}}
  char json[256];
  snprintf(json, sizeof(json),
    "{\"type\":\"data\",\"time\":%.2f,\"channels\":{\"100\":%.1f,\"101\":%.1f}}",
    elapsed, temp, hum);

  // Send via BLE notification
  pDataCharacteristic->setValue(json);
  pDataCharacteristic->notify();

  Serial.printf("[ESP32] Sent: temp=%.1f°C, hum=%.1f%% (t=%.2fs)\n", temp, hum, elapsed);
}