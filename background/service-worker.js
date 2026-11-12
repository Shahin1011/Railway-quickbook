/**
 * Railway QuickBook – Background Service Worker (Manifest V3)
 * Handles keyboard shortcuts (Alt+Shift+F), default storage init, and release time alarms.
 */

const ALARM_EAST = "rqb-alarm-east-8am";
const ALARM_WEST = "rqb-alarm-west-2pm";

// 1. Initialize default config on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["quickbookConfig"], (res) => {
    if (!res.quickbookConfig) {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const bst = new Date(utcMs + 6 * 3600000);
      bst.setDate(bst.getDate() + 9);
      const yyyy = bst.getFullYear();
      const mm = String(bst.getMonth() + 1).padStart(2, "0");
      const dd = String(bst.getDate()).padStart(2, "0");

      const initialConfig = {
        fromStation: "Dhaka",
        toStation: "Chattogram",
        journeyDate: `${yyyy}-${mm}-${dd}`,
        seatClass: "S_CHAIR",
        adultCount: 1,
        childCount: 0,
        preferredTrains: [
          "SUBORNO EXPRESS",
          "SONAR BANGLA EXPRESS",
          "COX'S BAZAR EXPRESS"
        ],
        coPassengers: [
          { name: "", type: "Adult" },
          { name: "", type: "Adult" },
          { name: "", type: "Adult" }
        ],
        options: {
          autoSubmitSearch: true,
          autoHighlightTrains: true,
          autoScrollToPreferred: true,
          autoExpandPreferredClass: false,
          dimNonPreferredTrains: false,
          showFloatingWidget: true,
          enableReleaseAlarm: false
        }
      };
      chrome.storage.local.set({ quickbookConfig: initialConfig });
    } else if (res.quickbookConfig.options?.enableReleaseAlarm) {
      scheduleReleaseAlarms(true);
    }
  });
});

// 2. Listen for config updates to toggle alarms
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "CONFIG_UPDATED" && message.config) {
    const enabled = !!message.config.options?.enableReleaseAlarm;
    scheduleReleaseAlarms(enabled);
    sendResponse({ status: "alarms_updated", enabled });
  }
  return true;
});

// 3. Schedule 07:58 AM BST & 01:58 PM BST Alarms
function getNextBstTimestamp(targetHour, targetMinute) {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const bstNow = new Date(utcMs + 6 * 3600000);

  const bstTarget = new Date(bstNow);
  bstTarget.setHours(targetHour, targetMinute, 0, 0);

  if (bstTarget <= bstNow) {
    bstTarget.setDate(bstTarget.getDate() + 1);
  }

  const diffMs = bstTarget.getTime() - bstNow.getTime();
  return Date.now() + diffMs;
}

function scheduleReleaseAlarms(enable) {
  if (!enable) {
    chrome.alarms.clear(ALARM_EAST);
    chrome.alarms.clear(ALARM_WEST);
    return;
  }

  chrome.alarms.create(ALARM_EAST, {
    when: getNextBstTimestamp(7, 58),
    periodInMinutes: 24 * 60
  });

  chrome.alarms.create(ALARM_WEST, {
    when: getNextBstTimestamp(13, 58),
    periodInMinutes: 24 * 60
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_EAST || alarm.name === ALARM_WEST) {
    const isEast = alarm.name === ALARM_EAST;
    chrome.notifications.create({
      type: "basic",
      iconUrl: "../assets/icon-128.png",
      title: isEast
        ? "🚆 পূর্বাঞ্চলের টিকিট ছাড়তে ২ মিনিট বাকি (8:00 AM)!"
        : "🚆 পশ্চিমাঞ্চলের টিকিট ছাড়তে ২ মিনিট বাকি (2:00 PM)!",
      message:
        "এখনই eticket.railway.gov.bd পেজে লগইন করে প্রস্তুত থাকুন। Alt+Shift+F চেপে দ্রুত Autofill করুন।",
      priority: 2
    });
  }
});

// 4. Global Keyboard Command (`Alt+Shift+F`)
chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger-autofill") {
    chrome.storage.local.get(["quickbookConfig"], (res) => {
      const config = res.quickbookConfig || null;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url && activeTab.url.includes("railway.gov.bd")) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: "TRIGGER_AUTOFILL",
            config
          });
        } else {
          chrome.storage.local.set({ pendingAutoFillOnLoad: true }, () => {
            chrome.tabs.create({ url: "https://eticket.railway.gov.bd/" });
          });
        }
      });
    });
  }
});

