const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const express = require("express");

//states
let browser = null;
let page = null;
let conversation = 1;

let requestQueue = Promise.resolve();
let isProcessing = false;
let canceledRequests = new Set(); // Store IDs of canceled requests

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
async function initializeServer() {
  return new Promise(async (resolve) => {
    await playWrightInit();
    await resolve();
  });
}

// changed to sequential since queue concurrent will cause issues in processing texts
const sequentialMiddleware = (req, res, next) => {
  const entry = { req, res, next };

  // Start processing the current request after all previous requests have been processed
  requestQueue = requestQueue.then(() => processRequest(entry));

  // Immediately handle any close events
  res.on("close", () => {
    console.log("Client disconnected");
    // Ensure the promise chain is not broken by resolving the current request
    // even if the client has disconnected
    entry.disconnected = true; // Mark the entry as disconnected
  });
};

const processRequest = ({ req, res, next, disconnected }) => {
  return new Promise((resolve) => {
    // Define a common handler for finishing the request processing
    const done = () => {
      res.removeListener("finish", done);
      res.removeListener("close", done);
      resolve(); // Resolve the promise to allow the next request to be processed
    };

    // Attach the handlers
    res.on("finish", done);
    // If the request was marked as disconnected, we still want to ensure
    // that the processing continues, so we don't attach a 'close' listener here
    // because it's already been handled in the middleware function

    // Call the next middleware or route handler
    if (!disconnected) {
      next();
    } else {
      // If the client disconnected before this point, we manually call `done`
      // to ensure the promise resolves and the queue continues
      done();
    }
  });
};

const app = express();
app.use(express.json());
app.use(express.urlencoded());
app.use(sequentialMiddleware);

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
  await page.waitForSelector('[aria-label="Stop generating"]', {
    timeout: 300000,
  });
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

initializeServer()
  .then(() => {
    const port = 8080;
    app.listen(port, () => {
      console.log(`Server is listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Error during server initialization:", err);
  });

// scrapeAndAutomateChat().catch((error) =>
//   console.error("Error in scraping chat:", error)
// );
