# 🏁 SPD Brackets Server

This is the backend service for the SPD Brackets prediction platform — used to handle transaction creation and verification on the Solana blockchain for tournament betting. This will be eventually replaced by smart contracts.

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone git@github.com:PBillingsby/spd-brackets-server.git
cd spd-brackets-server
```
### 2. Install Dependencies
`npm install`
### 3. Create an .env File

Copy the example and fill in your values: `cp .env.example .env`

### 4. Start the Server
`npm run dev`

This starts the server in development mode with auto-reloading via nodemon.

📄 Environment Variables
`NODE_ENV` - Environment type (development, production, etc.)
`PORT` - Port number the server listens on
`PAYMENT_MINT_ADDRESS` - The token mint address (e.g., USDC)
`PAYMENT_RECIPIENT_KEY` - Solana wallet that receives payments
`HASH_PRIVATE_KEY` - Server keypair (in JSON format) for signing transactions

📘 Endpoints
`POST /create-transaction`
Creates a partially signed Solana transaction for the client to complete.

`POST /verify-and-submit-transaction`
Verifies the fully signed transaction and submits it to the Solana network.

