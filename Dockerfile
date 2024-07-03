# Build Environment: Node + Playwright
FROM node
FROM mcr.microsoft.com/playwright

# Env
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

# Export port 8080 for Node
EXPOSE 8080

# Copy all app files into Docker Work directory
COPY package*.json /app/
COPY index.js /app/

# Install Deps
RUN npm install

# Run Node index.js file
CMD [ "npm","run", "dev" ]
# Build  JS to run via Node