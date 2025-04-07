# Digital Samba Sinch Conference Middleware Demo

The demo application in the `sinch-ds` folder demonstrates how to use the Sinch Voice API to handle incoming calls, prompt users for a PIN, and connect them to a conference based on the provided PIN.

The application can then notify the Digital Samba API when a phone user joins or leaves a conference. The application can also control the connected phone user via callbacks from Digital Samba.

A sqlite database is created with the following structure:

```plaintext
CONFERENCE : id, conference_id, digitalsamba_room_id
USERS : id, conference_id, pin, display_name, external_id
LIVE_CALLS : id, conference_id, call_id, pin, is_sip, start_time, cli
```

NOTE: Conference IDs and user PINs are constructed on the demo application side.

Conference IDs and user PINs are enforced to be unique by the database so that phone users and the SIP connection can be directed to the correct conference via the application's logic.

Conferences can be created via the application's UI or its API.

### API Endpoints

#### Conference Endpoints

##### GET /api/conferences

Retrieves a list of all conferences.

##### POST /api/conference

Creates a new conference with the provided conference_id and optional digitalsamba_room_id.

##### GET /api/conferences-and-users

Retrieves a list of all conferences with their associated users.

##### DELETE /api/conference/:conference_id

Deletes a specific conference by its ID and all associated users.

#### User Endpoints

##### GET /api/users

Retrieves a list of all users, or users filtered by conference_id if provided as a query parameter.

##### POST /api/user

Creates a new user with the provided conference_id, pin, optional display_name, and optional external_id.

##### PATCH /api/user/:pin/external-id

Updates the external_id for a user with the specified PIN.

##### DELETE /api/user

Deletes a specific user by their PIN.

#### Live Calls Endpoints

##### GET /api/live-calls

Retrieves a list of all active calls with user information.

##### GET /api/live-calls/:conference_id

Retrieves a list of all active calls for a specific conference.

##### POST /api/call/:call_id/mute

Mutes a specific call in a conference.

##### POST /api/call/:call_id/unmute

Unmutes a specific call in a conference.

##### POST /api/call/:call_id/kick

Removes a specific call from a conference.

----

When a phone user joins a conference, they are prompted for a PIN which is checked against the database. If the PIN exists, the phone user is connected to the relevant conference and Digital Samba is notified by passing the room_id, call_id, display_name and external_id to the phone_user_joined API call.

## Digital Samba API Integration

The application integrates with the Digital Samba API to provide real-time notifications about phone participants joining and leaving Digital Samba rooms. This integration is handled by the `digitalSambaService.js` module.

### Key Features

- **Authentication**: Uses Bearer token authentication with Digital Samba developer API key
- **Participant Join Notification**: Notifies Digital Samba when phone participants join a room
  - Sends participant details including call ID, phone number, name, and external ID
- **Participant Leave Notification**: Notifies Digital Samba when phone participants leave a room
  - Sends the call ID of the participant that left

### API Endpoints

The integration uses the following Digital Samba API endpoints:

- `/api/v1/rooms/{roomId}/phone-participants/joined`: Notifies when phone participants join a room
- `/api/v1/rooms/{roomId}/phone-participants/left`: Notifies when phone participants leave a room

## Features

- Handles Incoming Call Events (ICE)
- Prompts users for a PIN using DTMF input
- Handles Prompt Input Events (PIE)
- Validates the PIN against a database
- Connects users to a conference if the PIN is valid
- Handles Disconnected Call Events (DICE)
- Creates Digital Samba rooms via API, providing telephone number and PIN for SIP connection
- Notifies Digital Samba API about phone user joined events
- Notifies Digital Samba API about phone user left events
- Supports muting phone users via Digital Samba callbacks
- Supports unmuting phone users via Digital Samba callbacks
- Supports kicking phone users via Digital Samba callbacks
- Supports associating an external ID with users for use with Digital Samba API

## Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)
- Sinch account and application key
- Digital Samba account with telephony enabled and developer keys

## Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/yourusername/sinch-conference-middleware.git
    cd sinch-conference-middleware/sinch-ds
    ```

2. Set up environment variables:

    Create a `.env` file in the root of the [`sinch-ds`](sinch-ds) folder and add the following variables:

    ```plaintext
    SINCH_APPLICATION_KEY=your_sinch_application_key
    SINCH_APPLICATION_SECRET=your_sinch_application_secret
    DIGITAL_SAMBA_DEVELOPER_KEY=your_digital_samba_developer_key
    DIGITAL_SAMBA_API_URL=your_digital_samba_api_url
    ```

## Usage

1. Start the server:

    ```sh
    npm start
    ```

2. The server will start on `http://localhost:3030`.

3. Configure your Sinch application to use callback URL `http://your-server-ip:3030/VoiceEvent` to handle voice events.

4. Configure Digital Samba to send user control callbacks to `http://your-server-ip:3030/samba/callback`.

## Docker Support

You can build and run the application using Docker.

1. Build the Docker image:

    ```sh
    docker build -t sinch-conference-middleware . 
    ```

2. Run the Docker container:

    ```sh
    docker run -d -p 3030:3030 --env-file .env sinch-conference-middleware
    ```

## Auto Deployment using GitHub Actions

You can automate the deployment of the application to a server using GitHub Actions. Ensure you have SSH access to the server and the necessary permissions.

1. Create a GitHub Actions workflow file (`.github/workflows/main.yml`):

    ```yaml
    name: Deploy sinch-ds

    on:
      push:
        branches:
          - main  # Change to your deployment branch if needed

    jobs:
      build:
        runs-on: ubuntu-latest

        steps:
        - name: Checkout code
          uses: actions/checkout@v3

        - name: Set up Node.js
          uses: actions/setup-node@v3
          with:
            node-version: '18'  # Use Node.js version 18

        - name: Install dependencies
          run: |
            cd sinch-ds
            npm install

        - name: Log in to Docker Hub
          uses: docker/login-action@v3
          with:
            username: ${{ secrets.DOCKER_HUB_USERNAME }}
            password: ${{ secrets.DOCKER_HUB_TOKEN }}

        - name: Build and Push Docker Image
          run: |
            docker build -t digitalsamba376/sinch-ds:latest ./sinch-ds
            docker push digitalsamba376/sinch-ds:latest

        - name: Deploy to Server via SSH
          uses: appleboy/ssh-action@v1.0.3
          with:
            host: ${{ secrets.SERVER_HOST }}
            username: ${{ secrets.SERVER_USER }}
            key: ${{ secrets.SERVER_SSH_KEY }}
            script: |
              # Create .env file on the server
              echo "SINCH_APPLICATION_KEY=${{ secrets.SINCH_APPLICATION_KEY }}" > /path/to/.env
              echo "SINCH_APPLICATION_SECRET=${{ secrets.SINCH_APPLICATION_SECRET }}" >> /path/to/.env
              echo "DIGITAL_SAMBA_DEVELOPER_KEY=${{ secrets.DIGITAL_SAMBA_DEVELOPER_KEY }}" >> /path/to/.env
              echo "DIGITAL_SAMBA_API_URL=${{ secrets.DIGITAL_SAMBA_API_URL }}" >> /path/to/.env
              echo "PORT=${{ secrets.PORT }}" >> /path/to/.env

              # Pull the latest Docker image
              sudo docker pull digitalsamba376/sinch-ds:latest

              # Stop and remove the existing container if it exists
              sudo docker stop sinch-ds-dev || true
              sudo docker rm sinch-ds-dev || true

              # Run the new container
              sudo docker run -d --rm \
                                --name sinch-ds-dev \
                                -p 3030:3030 \
                                --env-file /path/to/.env \
                                digitalsamba376/sinch-ds:latest
    ```

2. Add the necessary secrets to your GitHub repository:

    - `DOCKER_HUB_USERNAME`: Your DockerHub username
    - `DOCKER_HUB_TOKEN`: Your DockerHub token
    - `SERVER_HOST`: The IP address of the server
    - `SERVER_USER`: The username for accessing the server
    - `SERVER_SSH_KEY`: Your SSH private key for accessing the server
    - `SINCH_APPLICATION_KEY`: Your Sinch application key
    - `SINCH_APPLICATION_SECRET`: Your Sinch application secret
    - `DIGITAL_SAMBA_DEVELOPER_KEY`: Your Digital Samba developer key
    - `DIGITAL_SAMBA_API_URL`: Your Digital Samba API URL
    - `PORT`: The port number (e.g., 3030)

## Project Structure

```plaintext
sinch-ds/
├── src/
│   ├── voice/
│   │   ├── controller.js
│   │   ├── serverBusinessLogic.js
│   │   ├── validateSignature.js
│   ├── middleware/
│   │   └── rawbody.js
│   ├── services/
│   │   ├── digitalSambaService.js
│   │   └── sinchService.js
│   ├── database.js
│   └── server.js
├── .env
├── Dockerfile
├── .github/
│   └── workflows/
│       └── main.yml
├── package.json
└── README.md
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Acknowledgements

Sinch for providing the Voice API  
Digital Samba for their telephony and conferencing API