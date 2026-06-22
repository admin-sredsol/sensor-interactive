# Connection Managers — Extension Architecture for sensor-interactive

> **Purpose:** This document analyzes the existing `SensorManager` architecture and proposes new connection managers to extend sensor-interactive beyond physical Vernier/Pasco hardware into a general-purpose **evidence streaming framework** for CODAP.

---

## 1. Current Architecture

### 1.1 Class Hierarchy

```
SensorManager (abstract base class)
    ├── SensorConnectorManager    — Vernier/Pasco via SensorConnector desktop app (HTTP)
    ├── SensorGDXManager          — Vernier Go Direct via Web Bluetooth (BLE)
    ├── HeartRateSensorManager    — Polar heart rate monitor via Web Bluetooth (BLE)
    ├── SensorTagManager          — TI SensorTag via Web Bluetooth (BLE)
    ├── ThermoscopeManager        — Thermoscope device via Web Bluetooth (BLE)
    └── FakeSensorManager         — Simulated sensor for testing/examples
```

### 1.2 The `SensorManager` Abstract Class

**File:** `src/models/sensor-manager.ts`

The base class defines the contract that all managers must implement:

```typescript
export interface NewSensorData {
  [key: string]: number[][];  // channelName → [[time, value], [time, value], ...]
}

export abstract class SensorManager {
  supportsDualCollection: boolean;
  supportsHeartbeat: boolean = false;

  // Required abstract methods
  abstract startPolling(): void;
  abstract hasSensorData(): boolean;
  abstract requestStart(measurementPeriod: number): void;
  abstract requestStop(): void;
  abstract isWirelessDevice(): boolean;
  abstract requestHeartbeat(enabled: boolean): void;
  abstract variableMeasurementPeriods(): VariableMeasurementPeriods;

  // Optional overrides
  isAwake(): boolean;           // default: true
  requestSleep(): void;         // default: no-op
  requestWake(): boolean;       // default: true (already awake)

  // Event system (listener pattern)
  addListener(type: string, handler: ListenerFunction): void;
  removeListener(type: string, handler: ListenerFunction): void;

  // Protected notification methods — subclasses call these to emit events
  protected onSensorConnect(sensorConfig: SensorConfiguration): void;
  protected onSensorDisconnect(): void;
  protected onSensorData(newData: NewSensorData): void;
  protected onSensorHeartbeat(sensorConfig: SensorConfiguration): void;
  protected onSensorCollectionStopped(): void;
  protected onSensorStatus(sensorConfig: SensorConfiguration): void;
  protected onCommunicationError(): void;
}
```

### 1.3 The `ConnectableSensorManager` Interface

For BLE devices that require explicit connection:

```typescript
export interface ConnectableSensorManager {
  connectToDevice: (device?: any) => Promise<boolean>;
  disconnectFromDevice: () => void;
  deviceConnected: boolean;
}
```

Implemented by: `SensorTagManager`, `ThermoscopeManager`

### 1.4 The `NewSensorData` Format

This is the **universal data contract** — every manager must produce data in this shape:

```typescript
{
  channelName: [[time, value], [time, value], ...],
  anotherChannel: [[time, value], [time, value], ...],
}
```

For example, a temperature + humidity sensor would emit:

```typescript
{
  temperature: [[0.01, 28.4], [0.02, 28.5]],
  humidity: [[0.01, 62.1], [0.02, 62.3]]
}
```

### 1.5 The `SensorConfiguration` Class

**File:** `src/models/sensor-configuration.ts`

Wraps `SensorConfig` from `@concord-consortium/sensor-connector-interface` and provides accessor methods for column metadata (name, units, position, live values). Each manager creates an `internalConfig` that describes its available channels.

### 1.6 Key Observation

The architecture is **already generalized** — `SensorManager` is an abstract base that knows nothing about Vernier hardware. The `SensorConnectorManager` is just one concrete implementation. The `NewSensorData` format is sensor-agnostic. This means adding new managers is primarily a matter of **implementing the abstract methods and calling `onSensorConnect()` / `onSensorData()`**.

---

## 2. Existing Managers — Quick Reference

| Manager | Transport | Channels | Wireless | Connectable |
|---------|-----------|----------|----------|-------------|
| `SensorConnectorManager` | HTTP (SensorConnector app) | Dynamic (depends on connected sensors) | ❌ | ❌ |
| `SensorGDXManager` | Web Bluetooth (BLE) | Dynamic (depends on GDX sensors) | ✅ | ✅ (via BLE) |
| `HeartRateSensorManager` | Web Bluetooth (BLE) | Heart Rate (bpm) | ✅ | ✅ (via BLE) |
| `SensorTagManager` | Web Bluetooth (BLE) | Temperature, Humidity, Lux | ✅ | ✅ (via BLE) |
| `ThermoscopeManager` | Web Bluetooth (BLE) | Temperature A, Temperature B | ✅ | ✅ (via BLE) |
| `FakeSensorManager` | In-memory (simulated) | Time, Temperature, Position | ❌ | ❌ |

---

## 3. Proposed New Connection Managers

### 3.1 `ESP32Manager` — ESP32 Microcontroller Bridge

**Priority:** 🔴 High — Lowest-cost path to physical sensor data without Vernier hardware

**Transport:** WebSocket over WiFi (primary) or Web Bluetooth (secondary)

**Target Sensors:**
| Sensor | Channels | Physics Topics |
|--------|----------|----------------|
| DHT22 | Temperature, Humidity | Climate, Thermodynamics |
| MPU6050 | ax, ay, az, gx, gy, gz | Pendulum, SHM, Rotation |
| HC-SR04 | Distance | Falling objects, Motion |
| HX711 + Load Cell | Force, Mass | Hooke's Law, Friction |
| BMP280 | Pressure, Temperature, Altitude | Weather, Gas Laws |
| Hall Effect | Magnetic Field | Electromagnetism |

**Architecture:**

```
ESP32 + Sensors
      ↓
  WiFi (WebSocket on ws://192.168.x.x:81)
      ↓
  ESP32Manager extends SensorManager
      ↓
  Sensor Interactive → CODAP
```

**Standardized Packet Format:**

```json
{
  "time": 12.35,
  "channels": {
    "temperature": 28.4,
    "humidity": 65,
    "ax": 0.02
  }
}
```

**Implementation Sketch:**

```typescript
export class ESP32Manager extends SensorManager {
  supportsDualCollection = true;
  private socket: WebSocket | null = null;
  private awake = false;

  isWirelessDevice() { return true; }

  startPolling() {
    this.socket = new WebSocket("ws://192.168.1.100:81");
    this.socket.onopen = () => {
      this.awake = true;
      this.onSensorConnect(/* config describing channels */);
    };
    this.socket.onmessage = (event) => {
      this.handlePacket(JSON.parse(event.data));
    };
  }

  private handlePacket(packet: any) {
    const data: NewSensorData = {};
    for (const [name, value] of Object.entries(packet.channels)) {
      data[name] = [[packet.time, value as number]];
    }
    this.onSensorData(data);
  }

  requestStart(measurementPeriod: number) { /* send start command */ }
  requestStop() { /* send stop command */ }
  hasSensorData() { return this.awake; }
  requestHeartbeat(enabled: boolean) { /* optional */ }
  variableMeasurementPeriods() { return { supported: false, periods: [], defaultPeriod: 100 }; }
}
```

**BLE Alternative:**

```
ESP32 + Sensors
      ↓
  Bluetooth LE (GATT characteristics)
      ↓
  Web Bluetooth API (navigator.bluetooth)
      ↓
  ESP32Manager (BLE mode) extends SensorManager
      ↓
  Sensor Interactive → CODAP
```

No server, no WiFi needed — direct browser-to-ESP32 communication.

---

### 3.2 `PhoneSensorManager` — Mobile Device Sensors

**Priority:** 🟡 Medium — Zero hardware cost, available on every phone/tablet

**Transport:** Browser Device Motion/Orientation APIs

**Channels:**
| API | Channels | Notes |
|-----|----------|-------|
| `devicemotion` | accelerationIncludingGravity (x,y,z), acceleration (x,y,z), rotationRate (α,β,γ) | Requires HTTPS + user gesture |
| `deviceorientation` | alpha, beta, gamma (compass + tilt) | Available on most mobile browsers |
| `Geolocation` | latitude, longitude, altitude, speed | Requires permission |

**Architecture:**

```
Phone/Tablet Sensors
      ↓
  Browser Device Motion/Orientation APIs
      ↓
  PhoneSensorManager extends SensorManager
      ↓
  Sensor Interactive → CODAP
```

**Implementation Sketch:**

```typescript
export class PhoneSensorManager extends SensorManager {
  supportsDualCollection = true;
  private collecting = false;

  isWirelessDevice() { return true; }

  startPolling() {
    // Request permission on iOS 13+
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(/* ... */);
    }
    this.onSensorConnect(/* config with ax, ay, az, gx, gy, gz channels */);
  }

  requestStart(measurementPeriod: number) {
    this.collecting = true;
    window.addEventListener('devicemotion', this.handleMotion);
    window.addEventListener('deviceorientation', this.handleOrientation);
  }

  requestStop() {
    this.collecting = false;
    window.removeEventListener('devicemotion', this.handleMotion);
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.onSensorCollectionStopped();
  }

  private handleMotion = (event: DeviceMotionEvent) => {
    if (!this.collecting) return;
    const data: NewSensorData = {};
    const t = performance.now() / 1000;
    if (event.accelerationIncludingGravity) {
      data.ax = [[t, event.accelerationIncludingGravity.x ?? 0]];
      data.ay = [[t, event.accelerationIncludingGravity.y ?? 0]];
      data.az = [[t, event.accelerationIncludingGravity.z ?? 0]];
    }
    this.onSensorData(data);
  };
}
```

**Use Cases:** Pendulum experiments, elevator acceleration, vehicle dynamics, sports science.

---

### 3.3 `RapierManager` — Physics Simulation Engine

**Priority:** 🟡 Medium — Enables simulation-to-data comparison

**Transport:** In-process (JavaScript simulation)

**Channels:** Dynamic — depends on simulation scenario

| Scenario | Channels |
|----------|----------|
| Spring-mass | displacement, velocity, acceleration, force |
| Projectile | x, y, vx, vy |
| Pendulum | angle, angular_velocity |
| Collision | momentum, kinetic_energy |

**Architecture:**

```
Rapier Physics Engine (WASM)
      ↓
  RapierManager extends SensorManager
      ↓
  Sensor Interactive → CODAP
```

**Implementation Sketch:**

```typescript
export class RapierManager extends SensorManager {
  supportsDualCollection = true;
  private running = false;
  private timer: number | null = null;
  private world: any; // Rapier world

  isWirelessDevice() { return false; }

  startPolling() {
    this.world = this.createWorld(); // Initialize Rapier simulation
    this.onSensorConnect(/* config with displacement, velocity channels */);
  }

  requestStart(measurementPeriod: number) {
    this.running = true;
    const dt = measurementPeriod / 1000;
    this.timer = window.setInterval(() => {
      this.world.step();
      const sample = this.collectPhysics();
      this.onSensorData(sample);
    }, measurementPeriod);
  }

  requestStop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  private collectPhysics(): NewSensorData {
    const t = this.world.time;
    const body = this.world.getRigidBody(this.rigidBodyHandle);
    const pos = body.translation();
    const vel = body.linvel();
    return {
      displacement: [[t, pos.x]],
      velocity: [[t, vel.x]],
    };
  }
}
```

**Key Insight:** To Sensor Interactive, a physics simulation is indistinguishable from a real sensor. Students can overlay simulated data on top of real sensor data in CODAP for comparison.

---

### 3.4 `WeatherManager` — Public Weather Data

**Priority:** 🟢 Low — Enriches physical sensor data with real-world context

**Transport:** HTTP REST API (NOAA, OpenWeatherMap, etc.)

**Channels:**
| Source | Channels |
|--------|----------|
| NOAA | Temperature, Pressure, Wind Speed, Wind Direction, Humidity |
| OpenWeatherMap | Temperature, Humidity, Pressure, Visibility |
| School Weather Station | Custom channels via API |

**Architecture:**

```
NOAA / OpenWeatherMap API
      ↓
  HTTP fetch (periodic polling)
      ↓
  WeatherManager extends SensorManager
      ↓
  Sensor Interactive → CODAP
```

**Implementation Sketch:**

```typescript
export class WeatherManager extends SensorManager {
  supportsDualCollection = false;
  private stationId: string;
  private interval: number | null = null;

  isWirelessDevice() { return false; }

  startPolling() {
    this.onSensorConnect(/* config with temperature, humidity, pressure channels */);
  }

  requestStart(measurementPeriod: number) {
    this.interval = window.setInterval(() => this.fetchWeatherData(), measurementPeriod);
  }

  private async fetchWeatherData() {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${this.stationId}&appid=${API_KEY}&units=metric`
    );
    const data = await response.json();
    const t = Date.now() / 1000;
    this.onSensorData({
      temperature: [[t, data.main.temp]],
      humidity: [[t, data.main.humidity]],
      pressure: [[t, data.main.pressure]],
    });
  }
}
```

**Use Cases:** Compare local sensor data with regional weather, climate studies, correlation analysis.

---

### 3.5 `RDKitManager` — Molecular Descriptor Streaming

**Priority:** 🟢 Low — Niche but revolutionary concept

**Transport:** In-process (RDKit WASM or REST API)

**Channels:**
| Descriptor | Units |
|-----------|-------|
| Molecular Weight | g/mol |
| LogP | — |
| TPSA (Topological Polar Surface Area) | Å² |
| H-Bond Donors | count |
| H-Bond Acceptors | count |
| Rotatable Bonds | count |

**Architecture:**

```
RDKit (WASM or REST)
      ↓
  RDKitManager extends SensorManager
      ↓
  Sensor Interactive → CODAP
```

**Key Insight:** Chemistry descriptors become "sensor channels." Students can stream molecular properties as if they were sensor readings, enabling chemistry-to-physics data comparison in CODAP.

---

### 3.6 `SalvaManager` — Fluid Dynamics Simulation

**Priority:** 🟢 Low — Specialized simulation

**Transport:** In-process (WASM)

**Channels:** Pressure, Density, Flow Rate, Velocity

---

### 3.7 `OpenMMManager` — Molecular Dynamics Simulation

**Priority:** 🟢 Low — Specialized simulation

**Transport:** In-process (WASM) or WebSocket to Python server

**Channels:** Temperature, Potential Energy, RMSD, Radius of Gyration

---

## 4. Implementation Priority & Roadmap

### Phase 1: Foundation (Recommended First)

| Manager | Effort | Impact | Rationale |
|---------|--------|--------|-----------|
| **ESP32Manager** | Medium | 🔴 Very High | Cheapest physical sensor path; no Vernier hardware needed |
| **PhoneSensorManager** | Low | 🟡 High | Zero hardware; every phone is a sensor |

### Phase 2: Simulation Integration

| Manager | Effort | Impact | Rationale |
|---------|--------|--------|-----------|
| **RapierManager** | Medium | 🟡 High | Enables sim-vs-real comparison in CODAP |
| **WeatherManager** | Low | 🟡 Medium | Context enrichment for physical sensor data |

### Phase 3: Advanced Extensions

| Manager | Effort | Impact | Rationale |
|---------|--------|--------|-----------|
| **RDKitManager** | High | 🟢 Niche | Chemistry-as-sensor concept |
| **SalvaManager** | High | 🟢 Niche | Fluid dynamics |
| **OpenMMManager** | High | 🟢 Niche | Molecular dynamics |

---

## 5. Refactoring Recommendations

### 5.1 Create `src/managers/` Directory

Move all manager implementations into a dedicated directory:

```
src/managers/
  sensor-manager.ts              (abstract base — stays)
  sensor-configuration.ts         (stays)
  sensor-connector-manager.ts     (Vernier/Pasco HTTP)
  sensor-gdx-manager.ts          (Vernier Go Direct BLE)
  sensor-polar-manager.ts         (Polar heart rate BLE)
  sensor-tag-manager.ts          (TI SensorTag BLE)
  thermoscope-manager.ts          (Thermoscope BLE)
  fake-sensor-manager.ts          (simulated)
  esp32-manager.ts                (NEW — ESP32 WebSocket/BLE)
  phone-sensor-manager.ts         (NEW — Device Motion API)
  rapier-manager.ts               (NEW — Physics simulation)
  weather-manager.ts              (NEW — Weather API)
```

### 5.2 Simplify `SensorConfiguration` Construction

Currently, every manager creates a verbose `internalConfig` with many boilerplate fields. Consider a builder pattern or factory:

```typescript
// Instead of 30+ lines of config boilerplate:
const config = SensorConfigurationBuilder.create()
  .withChannel("temperature", "degC", 0)
  .withChannel("humidity", "%", 1)
  .withInterface("ESP32 DHT22")
  .build();
```

### 5.3 Extract Connection Interface

BLE managers share significant connection logic. Consider a `BLEManager` base class:

```
SensorManager
    ├── BLEManager (abstract — shared BLE connection logic)
    │     ├── SensorGDXManager
    │     ├── HeartRateSensorManager
    │     ├── SensorTagManager
    │     ├── ThermoscopeManager
    │     └── ESP32Manager (BLE mode)
    ├── SensorConnectorManager (HTTP)
    ├── ESP32Manager (WebSocket mode)
    ├── PhoneSensorManager (Browser API)
    ├── RapierManager (In-process)
    ├── WeatherManager (REST API)
    └── FakeSensorManager (In-memory)
```

### 5.4 Standardize Packet Format

For WebSocket/REST-based managers, define a standard packet format:

```typescript
interface SensorPacket {
  time: number;
  channels: Record<string, number>;
}
```

This allows one `ESP32Manager` to handle any ESP32 sensor configuration dynamically.

---

## 6. The Bigger Picture: Evidence Interactive

The review document makes a profound observation: **sensor-interactive is accidentally more general than intended**. The `SensorManager` abstraction doesn't care whether data comes from:

- **Physical sensors** (Vernier, ESP32, phone)
- **Simulations** (Rapier, Salva, OpenMM)
- **Public datasets** (NOAA, NASA)
- **Computed descriptors** (RDKit)

The `NewSensorData` format — `{ channelName: [[time, value], ...] }` — is a **universal evidence format**. Every manager produces the same shape, making them interchangeable from CODAP's perspective.

This suggests a conceptual rename:

```
SensorManager → EvidenceManager
sensor-interactive → evidence-interactive
```

The architecture becomes:

```
Evidence Source (any manager)
        ↓
  EvidenceManager (abstract base)
        ↓
  Sensor Interactive (UI layer)
        ↓
  CODAP (data analysis)
```

Where "evidence sources" may be physical, simulated, or computational — all streaming `[time, value]` pairs into the same visualization and analysis pipeline.