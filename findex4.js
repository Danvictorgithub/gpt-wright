const { firefox } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();
firefox.use(stealth);
const INACTIVITY_TIMEOUT =
  (process.env.INACTIVITY_TIMEOUT_MINUTE
    ? parseInt(process.env.INACTIVITY_TIMEOUT_MINUTE)
    : 25) *
  60 *
  1000; // 25 minutes
let browser = null;
let conversations = {};
let requestQueues = {};

async function firefoxInit() {
  if (!browser) {
    console.log("Launching firefox");
    browser = await firefox.launch();
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
  const checkContent2 = await page.getByText("Welcome back");
  if (await checkContent2.isVisible()) {
    console.log("Re run");
    return await playWrightInit(chatId);
  }

  conversations[chatId] = {
    page,
    conversation: 1,
    conversationNo: 0,
    ready: true,
    lastActivity: Date.now(),
    timeout: setTimeout(() => {
      closeChatSession(chatId);
    }, INACTIVITY_TIMEOUT),
  };
  if (process.env.DEBUG == "true") {
    await page.screenshot({
      path: `screenshots/init-${chatId}.png`,
    });
    console.log(`screenshots/init-${chatId}.png`);
  }
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
app.use("/screenshots", express.static("screenshots"));
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to ChatGPT API Playwright reverse proxy by Deviate",
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
  chatSession.lastActivity = Date.now();
  clearTimeout(chatSession.timeout);
  chatSession.timeout = setTimeout(() => {
    closeChatSession(chatId);
  }, INACTIVITY_TIMEOUT);
  const promptResult = await scrapeAndAutomateChat(chatId, prompt.toString());
  if (
    promptResult.message ||
    prompt ==
      "You've reached our limit of messages per hour. Please try again later."
  ) {
    closeChatSession(chatId);
    return res.status(429).json({
      message: promptResult.message ? promptResult.message : promptResult,
    });
  }
  return res.json({ response: promptResult });
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
  try {
    if (prompt.length > 4096) {
      prompt = prompt.substring(0, 4096);
    }
    console.log(`Processing prompt for chat ${chatId}: \n`, prompt);
    const chatSession = conversations[chatId];
    let { page } = chatSession;
    chatSession.conversationNo++;
    console.log(chatSession.conversationNo);
    if (chatSession.conversationNo == 20) {
      await closeChatSession(chatId);
      return "You've reached our limit of messages per hour. Please try again later.";
    }
    await stayLoggedOut(page);
    if (process.env.DEBUG == "true") {
      await page.screenshot({
        path: `screenshots/1before-writing-${chatId}.png`,
      });
      console.log(`screenshots/1before-writing-${chatId}.png`);
    }
    await page.type("#prompt-textarea", prompt, {
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });
    if (process.env.DEBUG == "true") {
      await page.screenshot({
        path: `screenshots/2writing-before-clicking-${chatId}.png`,
      });
      console.log(`screenshots/2writing-before-clicking-${chatId}.png`);
    }
    // Wait for the send button to be present in the DOM
    await page.waitForSelector('[data-testid="send-button"]:not([disabled])', {
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });

    // Then click the button
    await page.click('[data-testid="send-button"]:not([disabled])', {
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });
    if (process.env.DEBUG == "true") {
      await page.screenshot({
        path: `screenshots/3after-clicking-${chatId}.png`,
      });
      console.log(`screenshots/3after-clicking-${chatId}.png`);
    }
    await page.waitForSelector(".result-thinking", {
      state: "hidden",
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });
    // Wait for the ".result-streaming" element to be hidden
    await page.waitForSelector(".result-streaming", {
      state: "hidden",
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });
    const limitCheck = await page.getByText(
      "You've reached our limit of messages per hour. Please try again later."
    );
    if (await limitCheck.isVisible()) {
      await closeChatSession(chatId);
      return "You've reached our limit of messages per hour. Please try again later.";
    }
    const limitCheck2 = await page.locator(
      '[class="btn relative btn-primary m-auto"]'
    );
    if (await limitCheck2.isVisible()) {
      await closeChatSession(chatId);
      return "You've reached our limit of messages per hour. Please try again later.";
    }
    await page.waitForSelector('[data-testid="stop-button"]', {
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });

    await page.waitForSelector('[data-testid="stop-button"]', {
      state: "hidden",
      timeout: process.env.WAIT_TIMEOUT
        ? parseInt(process.env.WAIT_TIMEOUT)
        : 300000,
    });
    chatSession.conversation += 2;
    if (chatSession.conversation == 3) {
      let text1 = await page
        .locator(`[data-testid="conversation-turn-2"]`)
        .innerText();
      let parsedText1 = text1.replace("ChatGPT\n\n", "").trim();
      if (
        parsedText1 ==
        "Something went wrong while generating the response. If this issue persists please contact us through our help center at help.openai.com."
      ) {
        await closeChatSession(chatId);
      }
    }
    let text = await page
      .locator(`[data-testid="conversation-turn-${chatSession.conversation}"]`)
      .innerText();
    console.log(text);
    const textCheck = text.split(" ");
    if (textCheck[0] == "ChatGPT\n\n" && textCheck.length <= 1) {
      text = await lazyLoadingFix(page, chatSession.conversation);
    }
    if (process.env.DEBUG == "true") {
      await page.screenshot({
        path: `screenshots/4parsing-text-${chatId}.png`,
      });
      console.log(`screenshots/4parsing-text-${chatId}.png`);
    }
    let parsedText = text.replace("ChatGPT\n\n", "").trim();

    if (
      parsedText ==
      "You've reached our limit of messages per hour. Please try again later."
    ) {
      await closeChatSession(chatId);
    }

    console.log(`Prompt response for chat ${chatId}: \n`, parsedText);
    return parsedText;
  } catch (e) {
    console.error(e);
    await closeChatSession(chatId);
    return { message: "Chat crashed, please create a new chat session" };
  }
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
firefoxInit().then(() => {
  const port = 8084;
  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
});
