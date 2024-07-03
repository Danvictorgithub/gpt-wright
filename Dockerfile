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
COPY index.ts /app/
COPY src/ /app/src/

# Install Deps
RUN npm install

# Build  JS to run via Node
RUN npm run build

# Run Node index.js file
CMD [ "npm", "dev" ]
# Build  JS to run via Node