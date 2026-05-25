# Dalaal Street - Stock Market Simulator

A real-time, local multiplayer stock market simulator designed for hosting mock trading events. The application features an interactive trading floor where teams can participate in an initial public offering (IPO), list shares, and trade with each other using a live order book.

---

## 🚀 Features

- **Real-Time Gameplay**: Uses Socket.io to synchronize stock prices, teams' balances, order books, and news across all participants.
- **Round-based Simulation**:
  - **Round 1 (IPO Phase)**: Teams buy stocks directly from the exchange at baseline prices.
  - **Rounds 2–5 (Trading Phase)**: Dynamic trading where stock prices fluctuate in real time according to a volatility engine, and teams trade directly with one another.
- **Interactive charts**: Visualizes stock price movements in real time using candlestick charts.
- **Order Book**: Allow teams to create, view, and fulfill buy/sell listings.
- **Admin Dashboard**: Comprehensive control panel to add teams, start the game, advance rounds, broadcast news alerts, cancel orders, or fast-forward rounds.
- **Lightweight Database**: Uses JSON file-based persistence (`mock_stock_state.json`), eliminating external SQL/NoSQL database dependencies.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Automation / Testing**: Socket.io-client for smoke testing, Node.js compilation scripts

---

## 📁 File Structure

```text
├── public/                 # Served static files (production frontend)
│   └── index.html          # Built frontend page (do not edit directly)
├── build_frontend.js       # Script to compile source frontend with socket support
├── dalaal_street.html      # Main frontend source template (edit here)
├── index.js                # Application entry point
├── mock_stock_state.json   # State database (auto-generated)
├── package.json            # Node.js dependencies and run scripts
├── server.js               # Main Express & Socket.io server logic
├── smoke_test.js           # Automated integration test suite
└── README.md               # Documentation
```

---

## 💻 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### 1. Install Dependencies
Install the required packages in the root directory:
```bash
npm install
```

### 2. Build the Frontend
Since the application uses a build-step to inject Socket.io integrations, compile the source frontend before running:
```bash
node build_frontend.js
```

### 3. Run the Server
Start the Express server on port `3000`:
```bash
npm start
```
Open `http://localhost:3000` in your web browser to access the application.

---

## 🧪 Testing

You can verify that all core trading functionalities (team joining, IPO buys, order creation, order matching, and round-advancement) are working correctly by running the automated smoke test.

1. Ensure the server is running on `http://localhost:3000` (`npm start`).
2. Run the smoke test in a new terminal:
```bash
node smoke_test.js
```
The test should connect, simulate trades between two teams, and exit with `code 0` if successful.

---

## 🔒 Security Note
* The admin panel password is hardcoded as `piyush26` (defined as `ADMIN_PASS` in both `server.js` and `dalaal_street.html`). Remember to change this if deploying to a public server.
