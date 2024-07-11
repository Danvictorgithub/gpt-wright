module.exports = {
  apps: [
    {
      name: "myapp",
      script: "./index1.js",
      watch: true,
      env: {
        PORT: 8080,
        DEBUG: false,
        INACTIVITY_TIMEOUT_MINUTE: 25,
        WAIT_TIMEOUT: 500000,
      },
    },
    {
      name: "myapp",
      script: "./index2.js",
      watch: true,
      env: {
        PORT: 8081,
        DEBUG: false,
        INACTIVITY_TIMEOUT_MINUTE: 25,
        WAIT_TIMEOUT: 500000,
      },
    },
    {
      name: "myapp",
      script: "./index.js",
      watch: true,
      env: {
        PORT: 8082,
        DEBUG: false,
        INACTIVITY_TIMEOUT_MINUTE: 25,
        WAIT_TIMEOUT: 500000,
      },
    },
  ],
};
