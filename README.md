# GPT-Wright v2

### ChatGPT 3.5-turbo reverse proxy with Chromium based PlayWright, Express REST-API

## Routes

GET / - Information or Health Check

POST /start - Generates a Chat ID - kills inactivity after 15 mins

POST /conversation - Prompt chat [ requires on request-body {prompt:string} ]

Currently only supports one chat conversation

### Free Cloud deployment

main server - https://gpt-wright.onrender.com
server 2 - https://gpt-wright-one.onrender.com
server 3 - https://gpt-wright-two.onrender.com
