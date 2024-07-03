const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const express = require("express");

//states
let browser = null;
let page = null;
let conversation = 1;
let ready = false;

let requestQueue = [];
let isProcessing = false;

// changed to sequential since queue concurrent will cause issues in processing texts
const sequentialMiddleware = (req, res, next) => {
  requestQueue.push({ req, res, next });
  processQueue();
};

const processQueue = () => {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;

  const { req, res, next } = requestQueue.shift();

  res.on("finish", () => {
    isProcessing = false;
    processQueue();
  });

  next();
};

const app = express();
app.use(express.json());
app.use(express.urlencoded());
app.use(isReadyMiddleWare);
app.use(sequentialMiddleware);

async function playWrightInit() {
  //Restarts if possible
  if (browser) {
    console.log("restarting");
    browser.close();
  }
  conversation = 1;
  console.log("Launching Chromium");
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto("https://www.chatgpt.com").catch(async (err) => {
    console.log("Re Run");
    await playWrightInit();
  });
  await page.screenshot({ path: "init.png", fullPage: true });
  await stayLoggedOut();
  // check redirect
  const checkContent = await page.getByText("Get started");
  if (await checkContent.isVisible()) {
    console.log("Re run");
    return await playWrightInit();
  }
  console.log("PlayWright is ready");
  ready = true;
}

function waitForReady(timeout = 1000) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (ready) {
        clearInterval(interval);
        resolve();
      }
    }, timeout);
  });
}

async function isReadyMiddleWare(req, res, next) {
  if (!ready) {
    await waitForReady();
  }
  return next();
}

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to ChatGPT API Playwright reverse proxy made by Deviate",
  });
});

app.post("/start", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    res.status(400).json({ message: "Prompt is required" });
  }
  await playWrightInit();
  const promptResult = await scrapeAndAutomateChat(prompt.toString());
  return res.send(promptResult);
});
app.post("/conversation", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Prompt is required" });
  }
  const promptResult = await scrapeAndAutomateChat(prompt.toString());
  return res.send(promptResult);
});

app.listen(8080, async () => {
  await playWrightInit();
  console.log("Listening to port 8080");
});

async function stayLoggedOut() {
  const button = await page.getByText("Stay logged out");
  if (await button.isVisible()) {
    button.click();
  } else {
  }
}

async function lazyLoadingFix() {
  const text = await page
    .getByTestId(`conversation-turn-${conversation}`)
    .innerText();
  const textCheck = text.split(" ");
  if (textCheck[0] == "ChatGPT\nChatGPT" && textCheck.length <= 1) {
    return lazyLoadingFix();
  }
  return text;
}

async function scrapeAndAutomateChat(prompt) {
  console.log("Processing prompt: ", prompt);
  // ChatGPT has a data-testid=conversation-turn-[number] where number start as 2 or the user response.
  // 'even' number identifies the user while 'odd' number are chatgpt prompt

  // Example: Sending initial message
  await page.type("#prompt-textarea", prompt);
  // allows chatgpt react to update its input
  await page.screenshot({ path: "prompt1.png", fullPage: true });
  await page.getByTestId("send-button").click();
  await page.waitForSelector('[aria-label="Stop generating"]');
  // 5 minutes prompt limit
  await page.waitForSelector('[data-testid="send-button"]', {
    timeout: 300000,
  });

  const recheck = await page.locator(".result-streaming");
  while (await recheck.isVisible()) {}
  conversation += 2;
  let text = await page
    .getByTestId(`conversation-turn-${conversation}`)
    .innerText();
  // Resolves chatgpt ui lazyloading showing blank on first chat
  const textCheck = text.split(" ");
  if (textCheck[0] == "ChatGPT\nChatGPT" && textCheck.length <= 1) {
    console.log("Lazy Fix");
    text = await lazyLoadingFix();
  }
  let parsedText = text.replace("ChatGPT\nChatGPT", "").trim();
  await page.screenshot({ path: "prompt2.png", fullPage: true });
  console.log("Prompt response: ", parsedText);
  await stayLoggedOut();
  return parsedText;
}

// scrapeAndAutomateChat().catch((error) =>
//   console.error("Error in scraping chat:", error)
// );
