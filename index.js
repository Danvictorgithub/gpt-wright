const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const express = require("express");

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// states
let browser = null;
let conversations = {};
let requestQueues = {}; // Separate queues for each chat session

async function playWrightInit(chatId) {
  if (!browser) {
    console.log("Launching Chromium");
    browser = await chromium.launch();
  }
  if (conversations[chatId] && conversations[chatId].page) {
    console.log(`Closing existing page for chat ${chatId}`);
    await conversations[chatId].page.close();
  }
  console.log(`Creating new page for chat ${chatId}`);
  const page = await browser.newPage();
  await page.goto("https://www.chatgpt.com").catch(async (err) => {
    console.log("Re Run");
    await playWrightInit(chatId);
  });
  await page.screenshot({
    path: `/screenshots/${chatId}_init.png`,
    fullPage: true,
  });
  await stayLoggedOut(page);
  // check redirect
  const checkContent = await page.getByText("Get started");
  if (await checkContent.isVisible()) {
    console.log("Re run");
    return await playWrightInit(chatId);
  }
  console.log(`PlayWright is ready for chat ${chatId}`);
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
}

async function closeChatSession(chatId) {
  if (conversations[chatId]) {
    console.log(`Closing chat session ${chatId} due to inactivity`);
    await conversations[chatId].page.close();
    delete conversations[chatId];
    delete requestQueues[chatId];
  }
}

async function initializeServer() {
  return new Promise(async (resolve) => {
    resolve();
  });
}

const sequentialMiddleware = (req, res, next) => {
  const chatId = req.body.chatId;
  if (!chatId) {
    return res.status(400).json({ message: "Chat ID is required" });
  }

  const entry = { req, res, next, disconnected: false };

  // Ensure a queue exists for this chatId
  if (!requestQueues[chatId]) {
    requestQueues[chatId] = Promise.resolve();
  }

  // Add the request to the specific chat session's queue
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
      // console.log("Finish handler called");
      finished = true;
      if (closeCalled) {
        done();
      }
    };

    const closeHandler = () => {
      // console.log("Close handler called");
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
  res.json({
    message: "Welcome to ChatGPT API Playwright reverse proxy made by Deviate",
  });
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
  chatSession.lastActivity = Date.now(); // Update last activity time
  clearTimeout(chatSession.timeout); // Reset inactivity timeout
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
  console.log(`Processing prompt for chat ${chatId}: `, prompt);
  const chatSession = conversations[chatId];
  const { page, conversation } = chatSession;

  await page.type("#prompt-textarea", prompt);
  await page.screenshot({
    path: `/screenshots/${chatId}_prompt1.png`,
    fullPage: true,
  });
  await page.getByTestId("send-button").click();
  await page.waitForSelector('[aria-label="Stop generating"]', {
    timeout: 300000,
  });
  await page.screenshot({
    path: `/screenshots/${chatId}_prompt2.png`,
    fullPage: true,
  });
  await page.waitForSelector('[data-testid="send-button"]', {
    timeout: 300000,
  });

  const recheck = await page.locator(".result-streaming");
  while (await recheck.isVisible()) {}

  chatSession.conversation += 2;
  let text = await page
    .getByTestId(`conversation-turn-${chatSession.conversation}`)
    .innerText();
  const textCheck = text.split(" ");
  if (textCheck[0] == "ChatGPT\nChatGPT" && textCheck.length <= 1) {
    console.log("Lazy Fix");
    text = await lazyLoadingFix(page, chatSession.conversation);
  }
  let parsedText = text.replace("ChatGPT\nChatGPT", "").trim();
  await page.screenshot({
    path: `/screenshots/${chatId}_prompt3.png`,
    fullPage: true,
  });
  console.log(`Prompt response for chat ${chatId}: `, parsedText);
  await stayLoggedOut(page);
  return parsedText;
}

function generateUniqueChatId() {
  return "chat_" + Math.random().toString(36).substr(2, 9);
}

// 404 handler middleware
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// General error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

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
