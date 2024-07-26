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
    // testInfo.setTimeout(0); // Disable timeout for this test
    const chatId = generateUniqueChatId();
    await playWrightInit(chatId);
    const prompt = `This is test prompt number 1`;
    const response = await scrapeAndAutomateChat(chatId, prompt);
    await setTimeout(() => { }, 360000)
    // for (let i = 0; i < 100; i++) {
    //     const prompt = `This is test prompt number ${i + 1}`;
    //     const response = await scrapeAndAutomateChat(chatId, prompt);
    //     expect(response).toBeDefined();
    //     console.log(`Prompt ${i + 1} processed successfully.`);
    // }

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
        const limitCheck2 = await page.getByText(
            "Something went wrong while generating the response. If this issue persists please contact us through our help center at help.openai.com."
        );
        if (await limitCheck2.isVisible()) {
            await closeChatSession(chatId);
            return "You've reached our limit of messages per hour. Please try again later.";
        }
        if (process.env.DEBUG == "true") {
            await page.screenshot({
                path: `screenshots/4after-streaming-${chatId}.png`,
            });
            console.log(`screenshots/4after-streaming-${chatId}.png`);
        }
        await page.waitForSelector('button.mb-1.me-1.flex.h-8.w-8.items-center.justify-center.rounded-full.bg-black.text-white.transition-colors.hover\\:opacity-70.focus-visible\\:outline-none.focus-visible\\:outline-black.disabled\\:bg-\\[\\#D7D7D7\\].disabled\\:text-\\[\\#f4f4f4\\].disabled\\:hover\\:opacity-100.dark\\:bg-white.dark\\:text-black.dark\\:focus-visible\\:outline-white.disabled\\:dark\\:bg-token-text-quaternary.dark\\:disabled\\:text-token-main-surface-secondary[data-testid="stop-button"]', {
            timeout: process.env.WAIT_TIMEOUT
                ? parseInt(process.env.WAIT_TIMEOUT)
                : 300000,
        });

        await page.waitForSelector('button.mb-1.me-1.flex.h-8.w-8.items-center.justify-center.rounded-full.bg-black.text-white.transition-colors.hover\\:opacity-70.focus-visible\\:outline-none.focus-visible\\:outline-black.disabled\\:bg-\\[\\#D7D7D7\\].disabled\\:text-\\[\\#f4f4f4\\].disabled\\:hover\\:opacity-100.dark\\:bg-white.dark\\:text-black.dark\\:focus-visible\\:outline-white.disabled\\:dark\\:bg-token-text-quaternary.dark\\:disabled\\:text-token-main-surface-secondary[data-testid="stop-button"]', {
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
            "You've reached our limit of messages per hour. Please try again later." ||
            parsedText ==
            "Something went wrong while generating the response. If this issue persists please contact us through our help center at help.openai.com."
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
