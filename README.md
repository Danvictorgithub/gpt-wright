# GPT-Wright v2

### ChatGPT 3.5-turbo reverse proxy with Chromium based PlayWright, Express REST-API

## Routes

GET / - Information or Health Check

POST /conversation - Prompt chat [ requires on request-body {prompt:string} ]

POST /start - Generates a Chat ID - kills inactivity after 15 mins

Currently only supports one chat conversation

### Free Cloud deployment

https://gpt-wright-one.onrender.com
