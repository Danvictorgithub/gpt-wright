# GPT-Wright v2 (Currently unavailable please use the Puppeteer version)

### ChatGPT 3.5-turbo reverse proxy with Chromium based PlayWright, Express REST-API, A free non-fine-tunable REST-API alternative for GPT chat completion API

## Routes

GET / - Information or Health Check

POST /start - Generates a Chat ID - kills inactivity after 15 mins

POST /conversation - Prompt chat [ requires on request-body {prompt:string} ]

~~Currently only supports one chat conversation~~
Now supports multiple chat conversations

### Free Cloud deployment

main server - https://gpt-wright.onrender.com

server 2 - https://gpt-wright-one.onrender.com

server 3 - https://gpt-wright-two.onrender.com

## How it works

Uses Playwright with Stealth plugin to always have unique browser configurations (and also bypasses cloudflare allowing almost limitless API calls and ChatGPT 1 hour limit prompts, Can generate 50k prompts in 24 hours on 12 threads CPU with medium length response or around 1-2k tokens)

Applies parallel API calls with each dependent Chat ID to have a 'Queue middleware'/it waits for pending response to finish (recurring chats must be finished before the next prompt is processed, or waiting for chatgpt to response before the next prompt is processed, this only applies if there are many pending prompts on the same ChatID)

This process uses ChatGPT no logins prompts which is similar to doing OPEN AI chat_completion API but free (but lacks the ability to fine tune)

Disclaimer: This must be used with caution as abuse on the OpenAI server may result in rate limiting issues based on IPs
