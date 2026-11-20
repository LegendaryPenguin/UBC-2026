import { extractArticle } from "./extract-article.js";

const defaultOrigin = "http://localhost:3000";
const originField = document.querySelector("#origin");
const addressSettings = document.querySelector("details");
const form = document.querySelector("form");
const button = document.querySelector("button");
const status = document.querySelector("#status");
const readyMessage = "Opens a new tab and shares the readable text with Thesis.";
let article;

originField.value = localStorage.getItem("thesisOrigin") || defaultOrigin;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.toggleAttribute("data-error", isError);
}

async function readCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) {
      setStatus("Open a web article in Chrome and try again.", true);
      return;
    }

    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractArticle });
    const result = injection?.result;
    if (!result?.title || result.text.length < 40 || result.url.length > 2000) {
      setStatus("No readable article found. Highlight a paragraph and reopen Thesis.", true);
      return;
    }

    article = result;
    document.querySelector("#source").textContent = new URL(article.url).hostname;
    document.querySelector("#title").textContent = article.title;
    document.querySelector(".article").hidden = false;
    setStatus(readyMessage);
    button.disabled = false;
  } catch {
    setStatus("Chrome could not read this page. Try opening a regular web article.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!article) return;
  const origin = URL.parse(originField.value.trim());
  const loopback = origin && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (!origin || (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))
    || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    addressSettings.open = true;
    originField.focus();
    setStatus("Enter the HTTPS address or the localhost URL of your Thesis app.", true);
    return;
  }

  button.disabled = true;
  try {
    const destination = new URL("/article-research", origin);
    destination.hash = `article=${encodeURIComponent(JSON.stringify(article))}`;
    await chrome.tabs.create({ url: destination.href });
    localStorage.setItem("thesisOrigin", origin.origin);
    window.close();
  } catch {
    setStatus("Could not open Thesis. Check the app address and try again.", true);
    button.disabled = false;
  }
});

void readCurrentTab();
