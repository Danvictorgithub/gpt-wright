# Build Environment: Node + Playwright
FROM node
FROM ghcr.io/puppeteer/puppeteer:latest

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

# Run Node index.js file and set limit to 500MB
CMD [ "node",".","--max-old-space-size=500","`which npm`", "install" ]
# Build  JS to run via Node