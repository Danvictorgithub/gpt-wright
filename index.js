const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();
chromium.use(stealth);
const INACTIVITY_TIMEOUT =
  (process.env.INACTIVITY_TIMEOUT_MINUTE
    ? parseInt(process.env.INACTIVITY_TIMEOUT_MINUTE)
    : 5) *
  60 *
  1000; // 5 minutes

let browser = null;
let conversations = {};
let requestQueues = {};

async function chromiumInit() {
  if (!browser) {
    console.log("Launching Chromium");
    browser = await chromium.launch();
  }
}

async function playWrightInit(chatId) {
  if (conversations[chatId] && conversations[chatId].page) {
    console.log(`Reusing existing page for chat ${chatId}`);
    return;
  }

  console.log(`Creating new page for chat ${chatId}`);
  const page = await browser.newPage();
  await page.goto("https://www.chatgpt.com").catch(async (err) => {
    console.log("Re Run");
    await playWrightInit(chatId);
  });

  await stayLoggedOut(page);

  const checkContent = await page.getByText("Get started");
  if (await checkContent.isVisible()) {
    console.log("Re run");
    return await playWrightInit(chatId);
  }

  conversations[chatId] = {
    page,
    conversation: 1,
    ready: true,
    lastActivity: Date.now(),
    timeout: setTimeout(() => {
      closeChatSession(chatId);
    }, INACTIVITY_TIMEOUT),
  };

  requestQueues[chatId] = Promise.resolve();
  console.log(`Page is ready for chat ${chatId}`);
}

async function closeChatSession(chatId) {
  if (conversations[chatId]) {
    console.log(`Closing chat session ${chatId} due to inactivity`);
    await conversations[chatId].page.close();
    delete conversations[chatId];
    delete requestQueues[chatId];
  }
}

const sequentialMiddleware = (req, res, next) => {
  const chatId = req.body.chatId;
  if (!chatId) {
    return res.status(400).json({ message: "Chat ID is required" });
  }

  const entry = { req, res, next, disconnected: false };

  if (!requestQueues[chatId]) {
    requestQueues[chatId] = Promise.resolve();
  }

  requestQueues[chatId] = requestQueues[chatId].then(() =>
    processRequest(entry)
  );

  res.on("close", () => {
    console.log(`Client disconnected from chat ${chatId}`);
    entry.disconnected = true;
  });
};

const processRequest = ({ req, res, next, disconnected }) => {
  return new Promise((resolve) => {
    let closeCalled = false;
    let finished = false;
    let checkFinishInterval;

    const done = () => {
      clearInterval(checkFinishInterval);
      resolve();
    };

    const finishHandler = () => {
      finished = true;
      if (closeCalled) {
        done();
      }
    };

    const closeHandler = () => {
      closeCalled = true;
      if (!finished) {
        checkFinishInterval = setInterval(() => {
          if (res.writableFinished) {
            finishHandler();
          }
        }, 50);
      } else {
        done();
      }
    };

    res.on("finish", finishHandler);
    res.on("close", closeHandler);

    if (!disconnected) {
      next();
    } else {
      done();
    }
  });
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "Welcome to ChatGPT API Playwright reverse proxy" });
});

app.post("/start", async (req, res) => {
  const chatId = generateUniqueChatId();
  await playWrightInit(chatId);
  res.json({ chatId });
});

app.post("/conversation", sequentialMiddleware, async (req, res) => {
  const { chatId, prompt } = req.body;
  if (!chatId || !prompt) {
    return res.status(400).json({ message: "Chat ID and prompt are required" });
  }
  const chatSession = conversations[chatId];
  if (!chatSession) {
    return res.status(404).json({ message: "Chat session not found" });
  }
  chatSession.lastActivity = Date.now();
  clearTimeout(chatSession.timeout);
  chatSession.timeout = setTimeout(() => {
    closeChatSession(chatId);
  }, INACTIVITY_TIMEOUT);
  const promptResult = await scrapeAndAutomateChat(chatId, prompt.toString());
  return res.send(promptResult);
});

async function stayLoggedOut(page) {
  const button = await page.getByText("Stay logged out");
  if (await button.isVisible()) {
    await button.click();
  }
}

async function lazyLoadingFix(page, conversation) {
  let text = await page
    .getByTestId(`conversation-turn-${conversation}`)
    .innerText();
  const textCheck = text.split(" ");
  if (textCheck[0] == "ChatGPT\nChatGPT" && textCheck.length <= 1) {
    return lazyLoadingFix(page, conversation);
  }
  return text;
}

async function scrapeAndAutomateChat(chatId, prompt) {
  console.log(`Processing prompt for chat ${chatId}: \n`, prompt);
  const chatSession = conversations[chatId];
  const { page, conversation } = chatSession;
  await stayLoggedOut(page);
  if (process.env.DEBUG == "true") {
    await page.screenshot({
      path: `screenshots/1before-writing-${chatId}.png`,
    });
    console.log(`screenshots/1before-writing-${chatId}.png`);
  }
  await page.type("#prompt-textarea", prompt, { timeout: 300000 });
  if (process.env.DEBUG == "true") {
    await page.screenshot({
      path: `screenshots/2writing-before-clicking-${chatId}.png`,
    });
    console.log(`screenshots/2writing-before-clicking-${chatId}.png`);
  }
  // Wait for the ".result-streaming" element to be hidden
  await page.waitForSelector(".result-streaming", {
    state: "hidden",
    timeout: 300000,
  });
  // await page.getByTestId("send-button", { timeout: 300000 }).click();
  // Wait for the send button to be present in the DOM
  await page.waitForSelector('[data-testid="send-button"]:not([disabled])', {
    timeout: 300000,
  });

  // Then click the button
  await page.click('[data-testid="send-button"]', { timeout: 300000 });
  if (process.env.DEBUG == "true") {
    await page.screenshot({
      path: `screenshots/3after-clicking-${chatId}.png`,
    });
    console.log(`screenshots/3after-clicking-${chatId}.png`);
  }
  await page.waitForSelector('[aria-label="Stop generating"]', {
    timeout: 300000,
  });
  await page.waitForSelector('[data-testid="send-button"]', {
    timeout: 300000,
  });
  // Wait for the loading indicator (button > div > svg) to be hidden
  await page.waitForSelector("button > div > svg", {
    state: "hidden",
    timeout: 300000,
  });
  // Wait for the ".result-streaming" element to be hidden
  await page.waitForSelector(".result-streaming", {
    state: "hidden",
    timeout: 300000,
  });

  chatSession.conversation += 2;
  let text = await page
    .getByTestId(`conversation-turn-${chatSession.conversation}`)
    .innerText();
  const textCheck = text.split(" ");
  if (textCheck[0] == "ChatGPT\nChatGPT" && textCheck.length <= 1) {
    text = await lazyLoadingFix(page, chatSession.conversation);
  }
  let parsedText = text.replace("ChatGPT\nChatGPT", "").trim();

  console.log(`Prompt response for chat ${chatId}: \n`, parsedText);
  await stayLoggedOut(page);
  return parsedText;
}

function generateUniqueChatId() {
  return "chat_" + Math.random().toString(36).substr(2, 9);
}

app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

chromiumInit().then(() => {
  const port = 8080;
  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
});
