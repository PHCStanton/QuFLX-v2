---
description: Repository Information Overview
alwaysApply: true
---

# QuFLX v2 Information

## Summary
QuFLX v2 is an **Event-Driven Modular Monolith** designed for real-time market data collection, analysis, and visualization. It transitions from a monolithic structure to a decoupled architecture using **Redis** as a central message bus, separating concerns into specialized services for data mining, strategy execution, and API delivery.

## Repository Structure
The project is organized into a backend microservices architecture and multiple specialized frontend applications.

### Main Repository Components
- **backend/**: Contains the core Python services including the Gateway, Collector, Strategy Engine, and AI service.
- **gui/**: Houses the frontend applications.
    - **Dashboard**: Main React/Vite visualization tool for real-time charts and AI insights.
    - **RiskManager**: TypeScript-based React application for risk assessment and management.
- **capabilities_v2/**: Core backend logic modules and calculation utilities.
- **ssid_integration_package/**: Specialized platform integration tools and sniper utilities.
- **system_LOGS/**: Centralized directory for service logs (Gateway, etc.).

## Projects

### Backend Services
**Configuration File**: `requirements.txt`

#### Language & Runtime
**Language**: Python  
**Version**: 3.11+  
**Build System**: Python Pip  
**Package Manager**: pip / conda (for TA-Lib)

#### Dependencies
**Main Dependencies**:
- **FastAPI**: API framework and Gateway service.
- **Redis**: Central message bus for Pub/Sub and streams.
- **Pydantic**: Data validation and models (`Tick`, `Candle`, `Signal`).
- **Pandas & NumPy**: Data analysis and indicator calculations.
- **Selenium**: Used by the Collector service for data interception.
- **TA-Lib**: Technical analysis library (installed via conda-forge).
- **Socket.io**: Real-time bidirectional communication between Gateway and Frontend.

#### Build & Installation
```bash
# Install dependencies
pip install -r requirements.txt

# TA-Lib requirement (recommended via conda)
conda install -c conda-forge ta-lib

# Environment setup
cp .env.example .env
```

#### Testing
**Framework**: Pytest
**Test Location**: `tests/`, `backend/tests/`
**Configuration**: `pytest.ini`
**Run Command**:
```bash
pytest
```

---

### Dashboard (GUI)
**Configuration File**: `gui/Dashboard/package.json`

#### Language & Runtime
**Language**: JavaScript / React  
**Version**: Node.js 18+  
**Build System**: Vite  
**Package Manager**: npm

#### Dependencies
**Main Dependencies**:
- **React**: Frontend UI framework.
- **Lightweight Charts**: High-performance TradingView charts.
- **Zustand**: State management (Smart Store pattern).
- **Socket.io-client**: Real-time data consumption from Gateway.
- **Lucide React**: Icon library.

#### Build & Installation
```bash
cd gui/Dashboard
npm install
npm run dev
```

#### Testing
**Framework**: Playwright
**Run Command**:
```bash
npm run test:qa
```

---

### Risk Manager (GUI)
**Configuration File**: `gui/RiskManager/package.json`

#### Language & Runtime
**Language**: TypeScript / React  
**Build System**: Vite  
**Package Manager**: npm

#### Dependencies
**Main Dependencies**:
- **Supabase**: Backend-as-a-Service integration.
- **Lucide React**: Icon library.
- **React**: UI framework.

#### Build & Installation
```bash
cd gui/RiskManager
npm install
npm run dev
```

### OTC Sniper (SSID Integration)
**Configuration File**: `ssid_integration_package/otc_sniper/requirements.txt`

#### Language & Runtime
**Language**: Python  
**Type**: Console-based trading execution terminal  
**Platform**: Windows-compatible (requires `windows-curses`)

#### Dependencies
**Main Dependencies**:
- **PocketOptionAPI-v2**: Specialized trading API for PocketOption.
- **windows-curses**: Terminal UI for Windows platforms.
- **python-dotenv**: Environment configuration.

#### Usage & Operations
**Key Commands**:
```bash
cd ssid_integration_package/otc_sniper
pip install -r requirements.txt
python start_hybrid_session.py
```

## Main Entry Points
- **Gateway**: `backend/services/gateway/main.py` (API & Socket.IO hub, default port 8000)
- **Collector**: `backend/services/collector/main.py` (Data interception from Chrome)
- **Strategy**: `backend/services/strategy/main.py` (Technical analysis and signal generation)
- **AI Service**: `backend/services/ai/service.py` (LLM integration and voice features)
- **Dashboard UI**: `gui/Dashboard` (Vite dev server)
