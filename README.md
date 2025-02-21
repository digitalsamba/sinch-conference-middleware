# Digital Samba Sinch Conference Middleware Demo

The demo application in the `sinch-ds` folder demonstrates how to use the Sinch Voice API to handle incoming calls, prompt users for a PIN, and connect them to a conference based on the provided PIN.

The application can then notify the Digital Samba API when a phone user joins or leaves a conference. The application can also control the connected phone user via callbacks from Digital Samba ( to do )

A sqlite database is created with the following structure :

```plaintext
CONFERENCES : conference_id, phone_humber
USERS : PIN, conference_id, token
```

NOTE : conference ids and user PINs are constructed on the application side.

Conferences can be created via the applications UI or its API 

### GET /conference

Retrieves a list of all conferences.

### POST /conference

Creates a new conference.

### GET /conference/:conference_id

Retrieves details of a specific conference by its ID.

### DELETE /conference/:conference_id

Deletes a specific conference by its ID.

### GET /user

Retrieves a list of all users.

### POST /user

Creates a new user.

### GET /user/:pin

Retrieves details of a specific user by their PIN.

### DELETE /user/:pin

Deletes a specific user by their PIN.

----

When a phone user joins a conference, they are prompted for a PIN which is checked against the database. If the PIN exists, the phone user is connected to the relevant conference and (to do) Digital Samba is notified by passing the users token via the phone_user_joined API call


## Features

- Handles Incoming Call Events (ICE)
- Prompts users for a PIN using DTMF input
- Handles Prompt Input Events (PIE)
- Validates the PIN against a database
- Connects users to a conference if the PIN is valid
- Handles Disconnected Call Events (DICE)

## TO DO 

- Add option to create a Digital Samba room via its API providing a telephone number and PIN for the SIP connection to the conference
- Add call to Digital Samba API to tell about phone user joined event
- Add call to Digital Samba API to tell about phone user left event
- Add option to mute phone user after receiving call back from Digital Samba
- Add option to unmute phone user after receiving call back from Digital Samba
- Add option to kick phone user after receiving call back from Digital Samba

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

    Create a `.env` file in the root of the [`sinch-ds`](sinch-ds ) folder and add the following variables:

    ```plaintext
    SINCH_APPLICATION_KEY=your_sinch_application_key
    SINCH_APPLICATION_SECRET=your_sinch_application_secret
    ```

## Usage

1. Start the server:

    ```sh
    npm start
    ```

2. The server will start on `http://localhost:3030`.

3. Configure your Sinch application to use callback URL `http://your-server-ip:3030/VoiceEvent` to handle voice events.


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
    - `PORT`: The port number (e.g., 3030)

## Project Structure

```plaintext
sinch-ds/
├── src/
│   ├── voice/
│   │   ├── controller.js
│   │   ├── serverBusinessLogic.js
│   │   └── validateSignature.js
│   ├── middleware/
│   │   └── rawbody.js
│   └── database.js
├── .env
├── Dockerfile
├── .github/
│   └── workflows/
│       └── main.yml
├── package.json
└── README.md
```

## License

This project is licensed under the GPL-3.0 License. See the LICENSE file for details.

## Acknowledgements

Sinch for providing the Voice API