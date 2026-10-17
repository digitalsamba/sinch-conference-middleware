# Sinch Conference Middleware

This project provides a middleware service to manage [Sinch](https://www.sinch.com) voice conferences and integrate them with [Digital Samba](https://www.digitalsamba.com) rooms. It offers a RESTful API for conference and user management, handles Sinch callbacks (ICE, PIE, DICE), notifies Digital Samba when a phone user has joined or left a Digital Samba room, handles phone_user_muted and phone_user_unmuted events from DigitalSamba and provides a simple web UI for interaction and demoing the incorporated functionality.

References :  [Sinch Voice API](https://developers.sinch.com/docs/voice) || [Digital Samba API](https://developer.digitalsamba.com/rest-api/) 

## Features

*   **Conference Management:** Create, list, and delete conferences.
*   **Phone User Management:** Add users (with PINs, display names, external IDs) to conferences, list users, remove users.
*   **Digital Samba Integration** Associate Sinch conferences with Digital Samba room IDs for Sinch conference participation and management from a Digital Samba room.
*   **Sinch Voice Callback Handling:** Processes ICE, PIE, and DICE events from Sinch via a webhook.
*   **Digital Samba Callback Handling:** Processes phone_participant_muted & phone_participant_unmuted events sent from Digital Samba via a webhook. 
*   **Database Persistence:** Stores conference and user data in SQLite.
*   **Web UI:** Simple frontend for managing conferences, users, and viewing active calls.
*   **Real-time server log streaming via WebSockets to the frontend UI.**
*   **Docker Support:** Includes a Dockerfile for containerized deployment.
*   **GitHub Actions CI/CD:** Lint, tests and `npm audit` on every PR; Docker image build, push and SSH deploy on `main` (dev) and version tags (production).
*   **Admin authentication:** The web UI, `/api/*` and the log stream require HTTP Basic credentials.

## Prerequisites

*   Node.js 24 LTS (22.13 or later works; the app uses the built-in `node:sqlite`, so there are no native modules to compile)
*   npm
*   Sinch Account (Application Key and Secret)
*   (Optional) Docker
*   Digital Samba account with telephony enabled (Developer key)

## Environment Variables

Create a `.env` file in the `sinch-ds` directory with the following variables:

```env
# Sinch API Credentials
SINCH_APPLICATION_KEY=YOUR_SINCH_APP_KEY
SINCH_APPLICATION_SECRET=YOUR_SINCH_APP_SECRET
SINCH_REGION=europe # Optional: Region for Sinch API calls (defaults to 'europe', options: 'global', 'europe', 'northAmerica', 'southAmerica', 'asiaSouthEast1', 'asiaSouthEast2'). Only change this if you know room SIP with be connecting from a non-European trunk.

# Digital Samba Configuration 
DIGITAL_SAMBA_DEVELOPER_KEY=YOUR_DS_DEVELOPER_KEY
DIGITAL_SAMBA_API_URL=https://api.digitalsamba.com # Or your specific DS API endpoint
DIGITAL_SAMBA_WEBHOOK_SECRET=CHANGE_ME # Bearer secret Digital Samba sends to /DigitalSambaListener. Use a long random value; the old default 'DigitalSambaListener' is public.

# Admin UI / API / log stream (HTTP Basic auth)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME # Long random value. If ADMIN_* are unset the UI and /api/* return 503.
# ADMIN_AUTH_DISABLED=true # Local demos only: leaves the UI and /api/* open to anyone who can reach the port.
# CORS_ORIGIN=https://example.com # Optional, comma-separated. CORS is off by default (the bundled UI is same-origin).

# Server Configuration
PORT=3030 # Optional: Port for the HTTP/WebSocket server (defaults to 3030)

# Database Configuration
DATABASE_PATH=./conference_data.db # Path to the SQLite database file (the Docker image defaults to /data/conference_data.db)

# MISC
SEND_CALLER_NUMBER=true # Optional: Set to 'false' to omit caller numbers from Digital Samba notifications

```

## Setup and Running

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd sinch-conference-middleware/sinch-ds
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create and populate the `.env` file** in the `sinch-ds` directory as described above.
4.  **Start the server:**
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3030` (or the `PORT` specified in `.env`). The WebSocket server for logs now runs on the same port.
5.  **Access the UI:** Open your browser and navigate to `http://localhost:3030` and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

### Tests and lint

```bash
npm test       # node:test suite: admin auth, API, signed Sinch ICE/PIE/DICE callbacks, DS webhook
npm run lint   # ESLint
```

## Security notes

*   **`/VoiceEvent`** accepts only callbacks signed with your Sinch application key/secret, and rejects signed callbacks whose `x-timestamp` is more than 15 minutes off (replay protection). Configure the callback URL in the Sinch dashboard as `https://<host>/VoiceEvent`.
*   **`/DigitalSambaListener`** requires `Authorization: Bearer <DIGITAL_SAMBA_WEBHOOK_SECRET>`.
*   **Everything else** (UI, `/api/*`, the log WebSocket) requires `ADMIN_USERNAME` / `ADMIN_PASSWORD`. The live log shows caller numbers and call IDs, and `/api/users` lists dial-in PINs, so do not expose this service with `ADMIN_AUTH_DISABLED=true`.
*   Never commit `.env`. It is ignored by git and excluded from the Docker build context.

## API Endpoints

*   `/VoiceEvent` (POST): Endpoint for Sinch voice callbacks (ICE, PIE, DICE).
*   `/DigitalSambaListener` (POST): Endpoint for Digital Samba room event callbacks (phone_participant_muted/phone_participant_unmuted).
*   `/healthz` (GET): Liveness probe, unauthenticated.

All `/api/*` endpoints require admin credentials. Bad input returns `400`, an unknown conference `404`, and a duplicate conference ID or PIN `409`. PINs are 1-6 digits.

*   `/api/conference` (POST): Create a new conference.
*   `/api/conferences` (GET): List all conferences.
*   `/api/conference/:conference_id` (DELETE): Delete a conference.
*   `/api/user` (POST): Add a user to a conference.
*   `/api/users` (GET): List all users or users by conference (`?conference_id=...`).
*   `/api/user` (DELETE): Remove a user by PIN.
*   `/api/user/:pin/external-id` (PATCH): Update a user's external ID.
*   `/api/conferences-and-users` (GET): List conferences with their associated users.
*   `/api/live-calls` (GET): List all currently active calls with user info.
*   `/api/live-calls/:conference_id` (GET): List active calls for a specific conference.
*   `/api/call/:call_id/mute` (POST): Mute a participant in a conference.
*   `/api/call/:call_id/unmute` (POST): Unmute a participant in a conference.
*   `/api/call/:call_id/kick` (POST): Kick a participant from a conference.



## Running with Docker Compose

The quickest path. From the repository root:

```bash
cp sinch-ds/.env.sample sinch-ds/.env   # then fill it in
docker compose up -d --build
```

The service listens on `http://localhost:3030`. The SQLite database is kept on a
named volume (`sinch-data`) so it survives `docker compose down` and rebuilds,
and the container is set to `restart: unless-stopped` so it comes back after a
host reboot or a Docker daemon restart.

## Docker Support

A `Dockerfile` is provided in the `sinch-ds` directory for building a container image.

1.  **Build the image:**
    ```bash
    cd sinch-ds
    docker build -t sinch-conference-middleware .
    ```
2.  **Run the container:**
    *Make sure you have a `.env` file in the `sinch-ds` directory.*
    ```bash
    # For Linux/macOS:
    docker run -d --restart unless-stopped -p 3030:3030 --env-file .env -v "$(pwd)/conference_data.db":/app/conference_data.db --name sinch-middleware sinch-conference-middleware
    # For Windows (Command Prompt):
    docker run -p 3030:3030 --env-file .env -v "%cd%\conference_data.db":/app/conference_data.db --name sinch-middleware sinch-conference-middleware
    # For Windows (PowerShell):
    docker run -p 3030:3030 --env-file .env -v "${PWD}\conference_data.db":/app/conference_data.db --name sinch-middleware sinch-conference-middleware
    ```
    *   `-p 3030:3030`: Maps the host port 3030 to the container's HTTP/WebSocket port.
    *   `--env-file .env`: Loads environment variables from your local `.env` file.
    *   `-v .../conference_data.db:/app/conference_data.db`: Mounts the local database file into the container for persistence (set `DATABASE_PATH=/app/conference_data.db` in `.env`, or mount a directory at `/data` instead). Create an empty `conference_data.db` file first if it doesn't exist (`touch conference_data.db` or `type nul > conference_data.db` on Windows). The container runs as the unprivileged `node` user (uid 1000), so on Linux the file must be writable by uid 1000 (`sudo chown 1000:1000 conference_data.db`).
    *   `--name sinch-middleware`: Assigns a name to the container.

## GitHub Actions CI/CD

*   **`ci.yml`** runs on every pull request and push to `main`: `npm ci`, `npm run lint`, `npm test`, `npm audit --omit=dev --audit-level=high`, then builds the image and waits for its health check.
*   **`main.yml`** (push to `main`) runs CI, then builds and pushes `digitalsamba376/sinch-ds:latest` and deploys it over SSH as `sinch-ds-dev`.
*   **`production.yml`** (tag `X.Y.Z`) does the same with `digitalsamba376/sinch-ds:X.Y.Z` as `sinch-ds-prod`.

Deployments run the container with `--restart unless-stopped` behind an nginx-proxy (`VIRTUAL_HOST`/`LETSENCRYPT_HOST`) on the `deployment_proxy` network. Secrets are written to a `0600` env file on the host rather than passed on the command line. Dependabot (`.github/dependabot.yml`) proposes npm, Docker base image and Actions updates.

Configure these secrets per GitHub environment (`development`, `production`):
*   `SINCH_APPLICATION_KEY`, `SINCH_APPLICATION_SECRET`, `SINCH_REGION` (optional)
*   `DIGITAL_SAMBA_DEVELOPER_KEY`, `DIGITAL_SAMBA_API_URL`, `DIGITAL_SAMBA_WEBHOOK_SECRET`, `SEND_CALLER_NUMBER` (optional)
*   `ADMIN_USERNAME`, `ADMIN_PASSWORD`
*   `PORT` (optional host port; defaults to 3030 for dev and 4030 for production), `DEPLOYMENT_PATH` (optional)
*   `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `DEV_HOST` / `PRODUCTION_HOST`
*   `DOCKER_HUB_USERNAME`, `DOCKER_HUB_TOKEN`

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

[MIT](LICENSE)
