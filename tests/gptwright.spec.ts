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
    console.log(`Processing prompt for chat ${chatId}: \n`, prompt);
    const chatSession = conversations[chatId];
    const { page, conversation } = chatSession;
    await stayLoggedOut(page);

    await page.type('#prompt-textarea', prompt, {
        timeout: process.env.WAIT_TIMEOUT ? parseInt(process.env.WAIT_TIMEOUT) : 300000,
    });

    // Wait for the send button to be enabled
    await page.waitForSelector('[data-testid="send-button"]:not([disabled])', {
        timeout: process.env.WAIT_TIMEOUT ? parseInt(process.env.WAIT_TIMEOUT) : 300000,
    });
    await stayLoggedOut(page)
    await page.click('[data-testid="send-button"]', {
        timeout: process.env.WAIT_TIMEOUT ? parseInt(process.env.WAIT_TIMEOUT) : 300000,
    });

    // Wait for response to appear
    await page.waitForSelector('.result-streaming', { state: 'hidden', timeout: process.env.WAIT_TIMEOUT ? parseInt(process.env.WAIT_TIMEOUT) : 300000 });
    const limitCheck = await page.getByText(
        "You've reached our limit of messages per hour. Please try again later."
    );
    if (await limitCheck.isVisible()) {
        return "You've reached our limit of messages per hour. Please try again later.";
    }
    const limitCheck2 = await page.locator(
        '[class="btn relative btn-primary m-auto"]'
    );
    if (await limitCheck2.isVisible()) {
        return "You've reached our limit of messages per hour. Please try again later. 2";
    }
    chatSession.conversation += 2;
    let text = await page.textContent(`[data-testid="conversation-turn-${chatSession.conversation}"]`);

    const textCheck = text.split(' ');
    if (textCheck[0] === 'ChatGPT\nChatGPT' && textCheck.length <= 1) {
        text = await lazyLoadingFix(page, chatSession.conversation);
    }
    let parsedText = text.replace('ChatGPT\nChatGPT', '').trim();

    console.log(`Prompt response for chat ${chatId}: \n`, parsedText);
    await stayLoggedOut(page);
    return parsedText;
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
