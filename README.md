GPT-Wright

ChatGPT 3.5-turbo reverse proxy with Chromium based PlayWright, Express REST-API

Routes
GET  / - Information or Health Check
POST /conversation - Prompt chat [ requires on request-body {prompt:string} ]
POST /start - Restarts chat wtih starter prompt [ requires on request-body {prompt:string} ]

Currently only supports one chat conversation
