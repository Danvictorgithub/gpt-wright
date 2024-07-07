// playwright-load.test.js
const { test, expect } = require('@playwright/test');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const dotenv = require('dotenv');

dotenv.config();
chromium.use(stealth);

let browser;
let page;

const INACTIVITY_TIMEOUT = (process.env.INACTIVITY_TIMEOUT_MINUTE ? parseInt(process.env.INACTIVITY_TIMEOUT_MINUTE) : 10) * 60 * 1000;

let conversations = {};
let requestQueues = {};

test.beforeAll(async () => {
    browser = await chromium.launch();
});

test.afterAll(async () => {
    await browser.close();
});

test('handle 100 prompts in a single chat session', async ({ }, testInfo) => {
    testInfo.setTimeout(0); // Disable timeout for this test
    const chatId = generateUniqueChatId();
    await playWrightInit(chatId);

    for (let i = 0; i < 100; i++) {
        const prompt = `This is test prompt number ${i + 1}`;
        const response = await scrapeAndAutomateChat(chatId, prompt);
        expect(response).toBeDefined();
        console.log(`Prompt ${i + 1} processed successfully.`);
    }

    await closeChatSession(chatId);
});

async function playWrightInit(chatId) {
    if (conversations[chatId] && conversations[chatId].page) {
        console.log(`Reusing existing page for chat ${chatId}`);
        return;
    }

    console.log(`Creating new page for chat ${chatId}`);
    page = await browser.newPage();
    await page.goto('https://www.chatgpt.com').catch(async (err) => {
        console.log('Re Run');
        await playWrightInit(chatId);
    });

    await stayLoggedOut(page);

    const checkContent = await page.textContent('body');
    if (checkContent.includes('Get started')) {
        console.log('Re run');
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

async function stayLoggedOut(page) {
    const button = await page.$('text=Stay logged out');
    if (button) {
        await button.click();
    }
}

async function scrapeAndAutomateChat(chatId, prompt) {
    async function scrapeAndAutomateChat(chatId, prompt) {
        try {
            if (prompt.length > 4096) {
                prompt = prompt.substring(0, 4096);
                console.log("Truncated prompt for chatId", chatId);
            }
            console.log(`Processing prompt for chat ${chatId}: \n`, prompt);

            const chatSession = conversations[chatId];
            const { page, conversation } = chatSession;

            await stayLoggedOut(page);

            if (process.env.DEBUG === "true") {
                await page.screenshot({
                    path: `screenshots/1before-writing-${chatId}.png`,
                });
                console.log(`Saved screenshot: 1before-writing-${chatId}.png`);
            }

            await page.type("#prompt-textarea", prompt, {
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            if (process.env.DEBUG === "true") {
                await page.screenshot({
                    path: `screenshots/2writing-before-clicking-${chatId}.png`,
                });
                console.log(`Saved screenshot: 2writing-before-clicking-${chatId}.png`);
            }

            await page.waitForSelector("button > div > svg", {
                state: "hidden",
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            await page.waitForSelector(".result-streaming", {
                state: "hidden",
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            await page.waitForSelector('[data-testid="send-button"]:not([disabled])', {
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            await page.click('[data-testid="send-button"]', {
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            if (process.env.DEBUG === "true") {
                await page.screenshot({
                    path: `screenshots/3after-clicking-${chatId}.png`,
                });
                console.log(`Saved screenshot: 3after-clicking-${chatId}.png`);
            }

            await page.waitForSelector('[aria-label="Stop generating"]', {
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            const limitCheck = await page.textContent(
                "You've reached our limit of messages per hour. Please try again later."
            );

            if (limitCheck) {
                return "You've reached our limit of messages per hour. Please try again later.";
            }

            await page.waitForSelector('[data-testid="send-button"]', {
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            await page.waitForSelector("button > div > svg", {
                state: "hidden",
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            await page.waitForSelector(".result-streaming", {
                state: "hidden",
                timeout: parseInt(process.env.WAIT_TIMEOUT) || 300000,
            });

            chatSession.conversation += 2;
            let text = await page.textContent(`conversation-turn-${chatSession.conversation}`);

            if (text.includes("ChatGPT\nChatGPT") && text.split(" ").length <= 1) {
                text = await lazyLoadingFix(page, chatSession.conversation);
            }

            let parsedText = text.replace("ChatGPT\nChatGPT", "").trim();

            if (parsedText === "You've reached our limit of messages per hour. Please try again later.") {
                await closeChatSession(chatId);
            }

            console.log(`Prompt response for chat ${chatId}: \n`, parsedText);
            await stayLoggedOut(page);
            return parsedText;
        } catch (error) {
            console.error(`Error processing chat ${chatId}:`, error);
            await closeChatSession(chatId);
            return "Chat crashed, please try to create another chatId";
        }
    }

}

async function lazyLoadingFix(page, conversation) {
    let text = await page.textContent(`[data-testid="conversation-turn-${conversation}"]`);
    const textCheck = text.split(' ');
    if (textCheck[0] === 'ChatGPT\nChatGPT' && textCheck.length <= 1) {
        return lazyLoadingFix(page, conversation);
    }
    return text;
}

function generateUniqueChatId() {
    return 'chat_' + Math.random().toString(36).substr(2, 9);
}
