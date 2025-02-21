# Set the base image with the specified Node.js version
ARG NODE_VERSION=22.4.1
FROM node:${NODE_VERSION}-bullseye-slim

# Set the environment variable for Node.js to run in production mode
ENV NODE_ENV=production

# Create and set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy all the application source files into the container
COPY . .

# Expose port 3030 for the application
EXPOSE 3030

# Define the command to run the application
CMD ["node", "src/server.js"]