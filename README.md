# Sinch Conference Middleware

This project provides a middleware service to manage Sinch voice conferences and integrate them with Digital Samba rooms. It offers a RESTful API for conference and user management, handles Sinch callbacks (ICE, ACE, DICE), notifies Digital Samba when a phone user has joined or left a Digital Samba room, handles phone_user_muted and phone_user_unmuted events from DigitalSamba and provides a simple web UI for interaction and demoing the incorporated functionality.

## Features

*   **Conference Management:** Create, list, and delete conferences.
*   **Phone User Management:** Add users (with PINs, display names, external IDs) to conferences, list users, remove users.
*   **Sinch Voice Callback Handling:** Processes ICE, ACE, and DICE events from Sinch via a webhook.
*   **Digital Samba Callback Handling:** Processes phone_participant_muted & phone_participant_unmuted events sent from Digital Samba via a webhook. 
*   **Digital Samba Integration** Associate Sinch conferences with Digital Samba room IDs for Sinch conference participation and management from a Digital Samba room.
*   **Live Call Management:** View active calls per conference, mute and unmute participants via the UI. 
*   **Database Persistence:** Stores conference and user data in SQLite.
*   **Web UI:** Simple frontend for managing conferences, users, and viewing active calls.
*   **Real-time server log streaming via WebSockets to the frontend UI.**
*   **Docker Support:** Includes a Dockerfile for containerized deployment.
*   **GitHub Actions CI/CD:** Automated build, test (placeholder), and Docker image push to GitHub Packages.

## Prerequisites

*   Node.js (v18 or later recommended)
*   npm
*   Sinch Account (Application Key and Secret)
*   (Optional) Docker

## Environment Variables

Create a `.env` file in the `sinch-ds` directory with the following variables:

```env
# Sinch API Credentials
SINCH_APPLICATION_KEY=YOUR_SINCH_APP_KEY
SINCH_APPLICATION_SECRET=YOUR_SINCH_APP_SECRET

# Server Configuration
PORT=3030 # Optional: Port for the HTTP/WebSocket server (defaults to 3030)

# Digital Samba Configuration (Optional)
DIGITAL_SAMBA_API_KEY=YOUR_DS_API_KEY
DIGITAL_SAMBA_API_SECRET=YOUR_DS_API_SECRET
DIGITAL_SAMBA_API_URL=https://api.digitalsamba.com # Or your specific DS API endpoint
DIGITAL_SAMBA_WEBHOOK_SECRET=DigitalSambaListener # Secret for authenticating Digital Samba webhook calls

# Database Configuration
DATABASE_PATH=./conference_data.db: Path to the SQLite database file
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
5.  **Access the UI:** Open your browser and navigate to `http://localhost:3030`.

## API Endpoints

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

*   `/VoiceEvent` (POST): Endpoint for Sinch voice callbacks (ICE, ACE, DICE).
*   `/DigitalSambaListener` (POST): Webhook endpoint for Digital Samba events (mute/unmute). Requires `Authorization: Bearer <DIGITAL_SAMBA_WEBHOOK_SECRET>` header.

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
    docker run -p 3030:3030 --env-file .env -v "$(pwd)/conference_data.db":/app/conference_data.db --name sinch-middleware sinch-conference-middleware
    # For Windows (Command Prompt):
    docker run -p 3030:3030 --env-file .env -v "%cd%\conference_data.db":/app/conference_data.db --name sinch-middleware sinch-conference-middleware
    # For Windows (PowerShell):
    docker run -p 3030:3030 --env-file .env -v "${PWD}\conference_data.db":/app/conference_data.db --name sinch-middleware sinch-conference-middleware
    ```
    *   `-p 3030:3030`: Maps the host port 3030 to the container's HTTP/WebSocket port.
    # *   `-p 3031:3031`: Removed
    *   `--env-file .env`: Loads environment variables from your local `.env` file.
    *   `-v .../conference_data.db:/app/conference_data.db`: Mounts the local database file into the container for persistence. Create an empty `conference_data.db` file first if it doesn't exist (`touch conference_data.db` or `type nul > conference_data.db` on Windows).
    *   `--name sinch-middleware`: Assigns a name to the container.

## GitHub Actions CI/CD

This repository uses GitHub Actions for continuous integration and deployment. The workflow (`.github/workflows/main.yml`) performs the following:

1.  **Checkout:** Checks out the code.
2.  **Set up Node.js:** Installs the specified Node.js version.
3.  **Install Dependencies:** Runs `npm install` in the `sinch-ds` directory.
4.  **Lint Check:** Runs ESLint (if configured).
5.  **Run Tests:** Executes tests (currently a placeholder `npm test`).
6.  **Login to GitHub Container Registry:** Logs into `ghcr.io`.
7.  **Create .env file:** Creates a temporary `.env` file using secrets for the Docker build.
8.  **Build and Push Docker Image:** Builds the Docker image (using the created `.env` file) and pushes it to `ghcr.io/<your-github-username>/sinch-conference-middleware`.

**Note:** You need to configure the following secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`) for the Docker build and push to work:
*   `SINCH_APPLICATION_KEY`
*   `SINCH_APPLICATION_SECRET`
*   `PORT` (optional, defaults to 3030 in the action)
*   `DATABASE_PATH` (optional, defaults to `./conference_data.db` in the action)
*   `DIGITAL_SAMBA_API_KEY` 
*   `DIGITAL_SAMBA_API_SECRET`
*   `DIGITAL_SAMBA_API_URL`
*   `DEPLOYMENT_PATH` (optional, defaults to `/opt/deployment/sinch-ds-dev` in the action)
*   `SERVER_HOST`
*   `SERVER_USER`
*   `SERVER_SSH_KEY`
*   `DEV_HOST`
*   `DOCKER_HUB_USERNAME`
*   `DOCKER_HUB_TOKEN`

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

[MIT](LICENSE)
