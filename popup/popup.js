/**
 * Railway QuickBook – Popup Dashboard Logic (Phase 2 & Phase 3)
 * Full bilingual support (English & Bangla)
 */

document.addEventListener("DOMContentLoaded", () => {
  const data = window.RAILWAY_DATA;
  let currentConfig = structuredClone(data.defaultConfig);

  // DOM Elements
  const els = {
    langBtns: document.querySelectorAll(".lang-btn"),
    masterToggle: document.getElementById("masterToggle"),
    masterToggleLabel: document.getElementById("masterToggleLabel"),
    bstClock: document.getElementById("bstClock"),
    releaseCountdown: document.getElementById("releaseCountdown"),
    tabBtns: document.querySelectorAll(".tab-btn"),
    tabPanes: document.querySelectorAll(".tab-pane"),
    trainCountBadge: document.getElementById("trainCountBadge"),

    previewFrom: document.getElementById("previewFrom"),
    previewTo: document.getElementById("previewTo"),
    previewDate: document.getElementById("previewDate"),
    previewClass: document.getElementById("previewClass"),
    previewZone: document.getElementById("previewZone"),

    fromStation: document.getElementById("fromStation"),
    toStation: document.getElementById("toStation"),
    swapStationsBtn: document.getElementById("swapStationsBtn"),
    stationList: document.getElementById("stationList"),
    stationChips: document.querySelectorAll(".station-chip"),

    journeyDate: document.getElementById("journeyDate"),
    formattedDateHint: document.getElementById("formattedDateHint"),
    dateChips: document.querySelectorAll(".date-chip"),

    seatClass: document.getElementById("seatClass"),
    adultCount: document.getElementById("adultCount"),
    childCount: document.getElementById("childCount"),

    autoSubmitSearch: document.getElementById("autoSubmitSearch"),
    autoExpandPreferredClass: document.getElementById("autoExpandPreferredClass"),
    showFloatingWidget: document.getElementById("showFloatingWidget"),
    autoHighlightTrains: document.getElementById("autoHighlightTrains"),
    autoScrollToPreferred: document.getElementById("autoScrollToPreferred"),
    dimNonPreferredTrains: document.getElementById("dimNonPreferredTrains"),
    enableReleaseAlarm: document.getElementById("enableReleaseAlarm"),

    trainInput: document.getElementById("trainInput"),
    addTrainBtn: document.getElementById("addTrainBtn"),
    popularTrainList: document.getElementById("popularTrainList"),
    routeTrainChips: document.getElementById("routeTrainChips"),
    preferredTrainList: document.getElementById("preferredTrainList"),

    paxName1: document.getElementById("paxName1"),
    paxType1: document.getElementById("paxType1"),
    paxName2: document.getElementById("paxName2"),
    paxType2: document.getElementById("paxType2"),
    paxName3: document.getElementById("paxName3"),
    paxType3: document.getElementById("paxType3"),

    newPresetTitle: document.getElementById("newPresetTitle"),
    savePresetBtn: document.getElementById("savePresetBtn"),
    presetList: document.getElementById("presetList"),

    statusToast: document.getElementById("statusToast"),
    saveConfigBtn: document.getElementById("saveConfigBtn"),
    autofillNowBtn: document.getElementById("autofillNowBtn")
  };

  // =========================================================================
  // 1. Multilingual Support (i18n)
  // =========================================================================

  function getI18nText(key) {
    const lang = currentConfig.lang || "en";
    const dict = (window.RQB_I18N && window.RQB_I18N[lang]) || (window.RQB_I18N && window.RQB_I18N.en) || {};
    return dict[key] || "";
  }

  function applyLanguage(lang) {
    currentConfig.lang = lang || "en";
    document.documentElement.lang = currentConfig.lang;
    const dict = (window.RQB_I18N && window.RQB_I18N[currentConfig.lang]) || (window.RQB_I18N && window.RQB_I18N.en);
    if (!dict) return;

    // Active state on language switcher buttons
    els.langBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === currentConfig.lang);
    });

    // Translate all elements with data-i18n
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) {
        el.innerHTML = dict[key];
      }
    });

    // Translate placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (dict[key]) {
        el.placeholder = dict[key];
      }
    });

    // Translate titles/tooltips
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.dataset.i18nTitle;
      if (dict[key]) {
        el.title = dict[key];
      }
    });

    // Translate Seat Classes dropdown
    if (data && data.seatClasses) {
      const currentSelected = els.seatClass.value || currentConfig.seatClass || "S_CHAIR";
      els.seatClass.innerHTML = data.seatClasses
        .map((sc) => {
          let labelText = sc.label;
          if (currentConfig.lang === "en") {
            const enLabels = {
              S_CHAIR: "S_CHAIR (Shovon Chair)",
              SNIGDHA: "SNIGDHA (AC Chair)",
              AC_S: "AC_S (AC Seat / Cabin)",
              AC_B: "AC_B (AC Berth / Sleeper)",
              F_BERTH: "F_BERTH (First Class Berth)",
              F_SEAT: "F_SEAT (First Class Seat)",
              F_CHAIR: "F_CHAIR (First Class Chair)",
              SHOVAN: "SHOVAN (Non-AC Shovan)",
              SHULOV: "SHULOV (Second Class Shulov)",
              AC_CHAIR: "AC_CHAIR (AC Chair)"
            };
            labelText = enLabels[sc.code] || sc.code;
          }
          return `<option value="${sc.code}">${labelText}</option>`;
        })
        .join("");
      els.seatClass.value = currentSelected;
    }

    // Refresh dynamic sections
    updatePreviewBanner();
    renderPreferredTrains();
    renderPresets();
    updateClockAndCountdown();
  }

  // =========================================================================
  // 2. Initialization & Static Lists
  // =========================================================================

  function populateStaticLists() {
    // Stations Datalist
    els.stationList.innerHTML = data.stations
      .map((st) => `<option value="${st}"></option>`)
      .join("");

    // Popular Trains Datalist
    els.popularTrainList.innerHTML = data.popularTrains
      .map(
        (tr) =>
          `<option value="${tr.name}">${tr.name} (${tr.numbers.join("/")}) - ${tr.route}</option>`
      )
      .join("");
  }

  // Helper: Get offset date in YYYY-MM-DD (Bangladesh Time UTC+6)
  function getOffsetDateString(offsetDays = 9) {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const bstDate = new Date(utcMs + 6 * 3600000);
    bstDate.setDate(bstDate.getDate() + offsetDays);
    const yyyy = bstDate.getFullYear();
    const mm = String(bstDate.getMonth() + 1).padStart(2, "0");
    const dd = String(bstDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Format YYYY-MM-DD -> DD-MMM-YYYY (e.g., 20-Nov-2026) as used by Railway site
  function formatRailwayDate(isoDate) {
    if (!isoDate) return "--";
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const mIndex = parseInt(parts[1], 10) - 1;
    return `${parts[2]}-${months[mIndex] || parts[1]}-${parts[0]}`;
  }

  // Detect Zone (East 8 AM vs West 2 PM) based on station or preferred trains
  function detectZone(fromSt, toSt) {
    const westStations = new Set([
      "Rajshahi", "Khulna", "Rangpur", "Dinajpur", "Panchagarh",
      "Ishwardi", "Natore", "Santahar", "Bogura", "Parbatipur",
      "Saidpur", "Nilphamari", "Chilahati", "Thakurgaon_Road",
      "Kurigram", "Lalmonirhat", "Gaibandha", "Jashore", "Benapole",
      "Kushtia_Court", "Poradaha", "Chuadanga", "Darshana_Halt",
      "Sirajganj_Bazar", "Ullapara", "Bhanga", "Faridpur", "Rajbari",
      "Chapainawabganj"
    ]);

    const isWest = westStations.has(fromSt) || westStations.has(toSt);
    const isBn = currentConfig.lang === "bn";

    if (isWest) {
      return {
        zone: "WEST",
        label: isBn ? "পশ্চিমাঞ্চল (2:00 PM)" : "West Zone (2:00 PM)"
      };
    }
    return {
      zone: "EAST",
      label: isBn ? "পূর্বাঞ্চল (8:00 AM)" : "East Zone (8:00 AM)"
    };
  }

  // =========================================================================
  // 3. Load & Save Config (`chrome.storage.local`)
  // =========================================================================

  function loadConfig() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["quickbookConfig"], (result) => {
        if (result.quickbookConfig) {
          currentConfig = {
            ...structuredClone(data.defaultConfig),
            ...result.quickbookConfig,
            options: {
              ...data.defaultConfig.options,
              ...(result.quickbookConfig.options || {})
            }
          };
        }
        if (!currentConfig.journeyDate) {
          currentConfig.journeyDate = getOffsetDateString(9);
        }
        if (!currentConfig.lang) {
          currentConfig.lang = "en";
        }
        renderConfigToUI();
      });
    } else {
      // Standalone preview fallback
      currentConfig.journeyDate = getOffsetDateString(9);
      if (!currentConfig.lang) currentConfig.lang = "en";
      renderConfigToUI();
    }
  }

  function collectConfigFromUI() {
    currentConfig.lang = currentConfig.lang || "en";
    currentConfig.enabled = els.masterToggle.checked;
    currentConfig.fromStation = els.fromStation.value.trim() || "Dhaka";
    currentConfig.toStation = els.toStation.value.trim() || "Chattogram";
    currentConfig.journeyDate = els.journeyDate.value || getOffsetDateString(9);
    currentConfig.seatClass = els.seatClass.value || "S_CHAIR";
    currentConfig.adultCount = parseInt(els.adultCount.value, 10) || 1;
    currentConfig.childCount = parseInt(els.childCount.value, 10) || 0;

    // Enforce max 4 passengers rule of Bangladesh Railway
    if (currentConfig.adultCount + currentConfig.childCount > 4) {
      currentConfig.childCount = Math.max(0, 4 - currentConfig.adultCount);
      els.childCount.value = String(currentConfig.childCount);
    }

    currentConfig.coPassengers = [
      { name: els.paxName1.value.trim(), type: els.paxType1.value },
      { name: els.paxName2.value.trim(), type: els.paxType2.value },
      { name: els.paxName3.value.trim(), type: els.paxType3.value }
    ];

    currentConfig.options = {
      autoSubmitSearch: els.autoSubmitSearch.checked,
      autoExpandPreferredClass: els.autoExpandPreferredClass.checked,
      showFloatingWidget: els.showFloatingWidget.checked,
      autoHighlightTrains: els.autoHighlightTrains.checked,
      autoScrollToPreferred: els.autoScrollToPreferred.checked,
      dimNonPreferredTrains: els.dimNonPreferredTrains.checked,
      enableReleaseAlarm: els.enableReleaseAlarm.checked
    };
  }

  function saveConfig(showNotification = true, callback = null) {
    collectConfigFromUI();
    updatePreviewBanner();

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ quickbookConfig: currentConfig }, () => {
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: "CONFIG_UPDATED",
            config: currentConfig
          }).catch(() => {});
        }
        // Notify all open tabs immediately so in-page widget & seat counters update in real-time
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            (tabs || []).forEach((t) => {
              if (t.id) {
                chrome.tabs.sendMessage(t.id, {
                  action: "CONFIG_UPDATED",
                  config: currentConfig
                }).catch(() => {});
              }
            });
          });
        }
        if (showNotification) {
          showToast(getI18nText("statusSaved"));
        }
        if (callback) callback();
      });
    } else {
      if (showNotification) showToast(getI18nText("statusSaved"));
      if (callback) callback();
    }
  }

  // =========================================================================
  // 4. UI Rendering
  // =========================================================================

  function renderConfigToUI() {
    const isEnabled = currentConfig.enabled !== false;
    els.masterToggle.checked = isEnabled;
    els.masterToggleLabel.textContent = isEnabled ? "ON" : "OFF";
    els.masterToggle.closest(".master-switch").classList.toggle("is-off", !isEnabled);

    els.fromStation.value = currentConfig.fromStation;
    els.toStation.value = currentConfig.toStation;
    els.journeyDate.value = currentConfig.journeyDate;
    els.seatClass.value = currentConfig.seatClass;
    els.adultCount.value = String(currentConfig.adultCount || 1);
    els.childCount.value = String(currentConfig.childCount || 0);

    const coPax = currentConfig.coPassengers || [];
    els.paxName1.value = coPax[0]?.name || "";
    els.paxType1.value = coPax[0]?.type || "Adult";
    els.paxName2.value = coPax[1]?.name || "";
    els.paxType2.value = coPax[1]?.type || "Adult";
    els.paxName3.value = coPax[2]?.name || "";
    els.paxType3.value = coPax[2]?.type || "Adult";

    const opts = currentConfig.options || data.defaultConfig.options;
    els.autoSubmitSearch.checked = !!opts.autoSubmitSearch;
    els.autoExpandPreferredClass.checked = opts.autoExpandPreferredClass !== false;
    els.showFloatingWidget.checked = opts.showFloatingWidget !== false;
    els.autoHighlightTrains.checked = opts.autoHighlightTrains !== false;
    els.autoScrollToPreferred.checked = opts.autoScrollToPreferred !== false;
    els.dimNonPreferredTrains.checked = !!opts.dimNonPreferredTrains;
    els.enableReleaseAlarm.checked = !!opts.enableReleaseAlarm;

    // Apply language texts across all elements
    applyLanguage(currentConfig.lang || "en");

    renderRouteSuggestions();
  }

  function updatePreviewBanner() {
    const from = els.fromStation.value.trim() || "Dhaka";
    const to = els.toStation.value.trim() || "Chattogram";
    const dateStr = formatRailwayDate(els.journeyDate.value);
    const sClass = els.seatClass.value || "S_CHAIR";
    const zoneInfo = detectZone(from, to);

    els.previewFrom.textContent = from;
    els.previewTo.textContent = to;
    els.previewDate.textContent = dateStr;
    els.previewClass.textContent = sClass;
    els.previewZone.textContent = zoneInfo.label;
    els.formattedDateHint.textContent = `(${dateStr})`;
  }

  function renderRouteSuggestions() {
    const from = (els.fromStation.value || "").toLowerCase();
    const to = (els.toStation.value || "").toLowerCase();

    const matched = data.popularTrains.filter((tr) => {
      const r = tr.route.toLowerCase();
      return (to && r.includes(to)) || (from && from !== "dhaka" && r.includes(from));
    });

    const listToShow = matched.length > 0 ? matched : data.popularTrains.slice(0, 6);
    const addTooltip = currentConfig.lang === "bn" ? "যোগ করতে ক্লিক করুন" : "Click to add to preferred list";

    els.routeTrainChips.innerHTML = listToShow
      .map(
        (tr) =>
          `<button type="button" class="train-suggest-chip" data-train="${tr.name}" title="${addTooltip}">
            + ${tr.name} (${tr.numbers[0]}/${tr.numbers[1]})
          </button>`
      )
      .join("");

    els.routeTrainChips.querySelectorAll(".train-suggest-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        addPreferredTrain(chip.dataset.train);
      });
    });
  }

  function renderPreferredTrains() {
    const list = currentConfig.preferredTrains || [];
    els.trainCountBadge.textContent = String(list.length);

    if (list.length === 0) {
      els.preferredTrainList.innerHTML = `
        <li class="train-item" style="border-left-color: #64748b; justify-content: center; color: #94a3b8;">
          ${getI18nText("noPreferredTrains")}
        </li>`;
      return;
    }

    const upTitle = currentConfig.lang === "bn" ? "ওপরে নিন" : "Move up";
    const downTitle = currentConfig.lang === "bn" ? "নিচে নিন" : "Move down";
    const delTitle = currentConfig.lang === "bn" ? "মুছে ফেলুন" : "Remove train";

    els.preferredTrainList.innerHTML = list
      .map(
        (trainName, idx) => `
        <li class="train-item">
          <div class="train-item-left">
            <span class="priority-badge">#${idx + 1}</span>
            <span class="train-item-name">${escapeHtml(trainName)}</span>
          </div>
          <div class="train-item-actions">
            <button type="button" class="icon-btn move-up" data-idx="${idx}" title="${upTitle}" ${idx === 0 ? "disabled" : ""}>▲</button>
            <button type="button" class="icon-btn move-down" data-idx="${idx}" title="${downTitle}" ${idx === list.length - 1 ? "disabled" : ""}>▼</button>
            <button type="button" class="icon-btn delete-btn remove-train" data-idx="${idx}" title="${delTitle}">✕</button>
          </div>
        </li>`
      )
      .join("");

    els.preferredTrainList.querySelectorAll(".move-up").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx, 10);
        if (i > 0) {
          [currentConfig.preferredTrains[i - 1], currentConfig.preferredTrains[i]] = [
            currentConfig.preferredTrains[i],
            currentConfig.preferredTrains[i - 1]
          ];
          renderPreferredTrains();
          saveConfig(false);
        }
      });
    });

    els.preferredTrainList.querySelectorAll(".move-down").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx, 10);
        if (i < currentConfig.preferredTrains.length - 1) {
          [currentConfig.preferredTrains[i + 1], currentConfig.preferredTrains[i]] = [
            currentConfig.preferredTrains[i],
            currentConfig.preferredTrains[i + 1]
          ];
          renderPreferredTrains();
          saveConfig(false);
        }
      });
    });

    els.preferredTrainList.querySelectorAll(".remove-train").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx, 10);
        currentConfig.preferredTrains.splice(i, 1);
        renderPreferredTrains();
        saveConfig(false);
      });
    });
  }

  function addPreferredTrain(rawName) {
    const clean = (rawName || "").trim().toUpperCase();
    if (!clean) return;
    if (!currentConfig.preferredTrains) currentConfig.preferredTrains = [];
    if (currentConfig.preferredTrains.some((t) => t.toUpperCase() === clean)) {
      showToast(getI18nText("trainExists"));
      return;
    }
    currentConfig.preferredTrains.push(clean);
    els.trainInput.value = "";
    renderPreferredTrains();
    saveConfig(false);
    showToast(`${getI18nText("trainAdded")} "${clean}"`);
  }

  function renderPresets() {
    const presets = currentConfig.savedPresets || data.defaultConfig.savedPresets;
    const loadLabel = getI18nText("loadPresetBtn") || "Load";
    const delLabel = currentConfig.lang === "bn" ? "প্রিসেট মুছুন" : "Delete preset";
    const trainsUnit = currentConfig.lang === "bn" ? "টি ট্রেন" : "trains";

    els.presetList.innerHTML = presets
      .map(
        (p, idx) => `
        <div class="preset-card" data-idx="${idx}">
          <div class="preset-info">
            <span class="preset-title">${escapeHtml(p.title)}</span>
            <span class="preset-sub">${escapeHtml(p.fromStation)} ➔ ${escapeHtml(p.toStation)} | ${escapeHtml(p.seatClass)} | ${(p.preferredTrains || []).length} ${trainsUnit}</span>
          </div>
          <div class="train-item-actions">
            <button type="button" class="btn-secondary apply-preset-btn" data-idx="${idx}" style="padding: 3px 8px; font-size: 11px;">${loadLabel}</button>
            <button type="button" class="icon-btn delete-btn delete-preset-btn" data-idx="${idx}" title="${delLabel}">✕</button>
          </div>
        </div>`
      )
      .join("");

    els.presetList.querySelectorAll(".apply-preset-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        const preset = presets[idx];
        if (!preset) return;
        currentConfig.fromStation = preset.fromStation;
        currentConfig.toStation = preset.toStation;
        currentConfig.seatClass = preset.seatClass || "S_CHAIR";
        currentConfig.preferredTrains = [...(preset.preferredTrains || [])];
        renderConfigToUI();
        saveConfig(false);
        const msg = currentConfig.lang === "bn"
          ? `🔖 "${preset.title}" প্রিসেট লোড করা হয়েছে!`
          : `🔖 Loaded preset: "${preset.title}"`;
        showToast(msg);
      });
    });

    els.presetList.querySelectorAll(".delete-preset-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        currentConfig.savedPresets.splice(idx, 1);
        renderPresets();
        saveConfig(false);
      });
    });
  }

  // =========================================================================
  // 5. Live Bangladesh Standard Time (BST) Clock & Release Countdown
  // =========================================================================

  function updateClockAndCountdown() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const bst = new Date(utcMs + 6 * 3600000);

    const h = bst.getHours();
    const m = bst.getMinutes();
    const s = bst.getSeconds();
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = String(h % 12 || 12).padStart(2, "0");
    els.bstClock.textContent = `${h12}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${ampm}`;

    // Next ticket release target: 08:00 AM or 14:00 (2:00 PM) BST
    const isBn = currentConfig.lang === "bn";
    let targetHour = 8;
    let label = isBn ? "8 AM রিলিজ" : "8 AM Release";

    if (h >= 8 && h < 14) {
      targetHour = 14;
      label = isBn ? "2 PM রিলিজ" : "2 PM Release";
    } else if (h >= 14) {
      targetHour = 32; // 8 AM next day
      label = isBn ? "কাল 8 AM" : "Tmrw 8 AM";
    }

    const totalNowSec = h * 3600 + m * 60 + s;
    const totalTargetSec = targetHour * 3600;
    const diffSec = totalTargetSec - totalNowSec;

    const remH = Math.floor(diffSec / 3600);
    const remM = Math.floor((diffSec % 3600) / 60);
    const remS = diffSec % 60;

    const hUnit = isBn ? "ঘ" : "h";
    const mUnit = isBn ? "মি" : "m";
    const sUnit = isBn ? "সে" : "s";

    els.releaseCountdown.textContent = `${label}: ${remH}${hUnit} ${remM}${mUnit} ${remS}${sUnit}`;
  }

  // =========================================================================
  // 6. Event Listeners & Trigger Autofill
  // =========================================================================

  // Language Switcher (EN vs বাংলা)
  els.langBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosenLang = btn.dataset.lang;
      if (chosenLang && chosenLang !== currentConfig.lang) {
        applyLanguage(chosenLang);
        saveConfig(false);
        const toastMsg =
          chosenLang === "bn"
            ? "🌐 ভাষা পরিবর্তন করা হয়েছে: বাংলা"
            : "🌐 Language switched to: English";
        showToast(toastMsg);
      }
    });
  });

  // Master Toggle Change
  els.masterToggle.addEventListener("change", () => {
    const isEnabled = els.masterToggle.checked;
    els.masterToggleLabel.textContent = isEnabled ? "ON" : "OFF";
    els.masterToggle.closest(".master-switch").classList.toggle("is-off", !isEnabled);
    saveConfig(true);
    showToast(isEnabled ? getI18nText("masterOnToast") : getI18nText("masterOffToast"));
  });

  // Tab Switching
  els.tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.tabBtns.forEach((b) => b.classList.remove("active"));
      els.tabPanes.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  // Swap Stations
  els.swapStationsBtn.addEventListener("click", () => {
    const temp = els.fromStation.value;
    els.fromStation.value = els.toStation.value;
    els.toStation.value = temp;
    updatePreviewBanner();
    renderRouteSuggestions();
    saveConfig(false);
  });

  // Quick Destination Station Chips
  els.stationChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      els.toStation.value = chip.dataset.to;
      if (!els.fromStation.value) els.fromStation.value = "Dhaka";
      updatePreviewBanner();
      renderRouteSuggestions();
      saveConfig(false);
    });
  });

  // Quick Date Chips (Today, Tomorrow, +9d, +10d)
  els.dateChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const offset = parseInt(chip.dataset.offset, 10);
      els.journeyDate.value = getOffsetDateString(offset);
      updatePreviewBanner();
      saveConfig(false);
      const msg = currentConfig.lang === "bn"
        ? `📅 তারিখ সেট হয়েছে: ${formatRailwayDate(els.journeyDate.value)}`
        : `📅 Date set: ${formatRailwayDate(els.journeyDate.value)}`;
      showToast(msg);
    });
  });

  // Input changes -> live update preview & auto-save
  [els.fromStation, els.toStation, els.journeyDate, els.seatClass].forEach((input) => {
    input.addEventListener("input", () => {
      updatePreviewBanner();
      renderRouteSuggestions();
    });
    input.addEventListener("change", () => {
      saveConfig(false);
    });
  });

  // Options checkboxes and passenger inputs auto-save on change
  [
    els.autoSubmitSearch,
    els.autoExpandPreferredClass,
    els.showFloatingWidget,
    els.autoHighlightTrains,
    els.autoScrollToPreferred,
    els.dimNonPreferredTrains,
    els.enableReleaseAlarm,
    els.adultCount,
    els.childCount,
    els.paxName1,
    els.paxName2,
    els.paxName3,
    els.paxType1,
    els.paxType2,
    els.paxType3
  ].forEach((el) => {
    if (el) {
      el.addEventListener("change", () => {
        saveConfig(false);
      });
    }
  });

  // Add Preferred Train
  els.addTrainBtn.addEventListener("click", () => {
    addPreferredTrain(els.trainInput.value);
  });

  els.trainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPreferredTrain(els.trainInput.value);
    }
  });

  // Save New Preset
  els.savePresetBtn.addEventListener("click", () => {
    collectConfigFromUI();
    const title =
      els.newPresetTitle.value.trim() ||
      `${currentConfig.fromStation} ➔ ${currentConfig.toStation} (${currentConfig.seatClass})`;
    if (!currentConfig.savedPresets) currentConfig.savedPresets = [];
    currentConfig.savedPresets.unshift({
      id: "preset-" + Date.now(),
      title,
      fromStation: currentConfig.fromStation,
      toStation: currentConfig.toStation,
      seatClass: currentConfig.seatClass,
      preferredTrains: [...(currentConfig.preferredTrains || [])]
    });
    els.newPresetTitle.value = "";
    renderPresets();
    saveConfig(false);
    const msg = currentConfig.lang === "bn"
      ? `🔖 "${title}" প্রিসেট সেভ হয়েছে!`
      : `🔖 Saved preset: "${title}"`;
    showToast(msg);
  });

  // Save Button
  els.saveConfigBtn.addEventListener("click", () => {
    saveConfig(true);
  });

  // Primary Action: Save & Trigger Autofill on Railway Website
  els.autofillNowBtn.addEventListener("click", () => {
    saveConfig(false, () => {
      if (typeof chrome === "undefined" || !chrome.tabs) {
        showToast(currentConfig.lang === "bn" ? "🌐 Chrome Extension মোডে এই বাটনটি রেলওয়ে সাইটে কাজ করবে।" : "🌐 This button triggers autofill on Railway website in extension mode.");
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url && activeTab.url.includes("railway.gov.bd")) {
          chrome.tabs.sendMessage(
            activeTab.id,
            {
              action: "TRIGGER_AUTOFILL",
              config: currentConfig
            },
            () => {
              if (chrome.runtime.lastError) {
                chrome.scripting.executeScript(
                  {
                    target: { tabId: activeTab.id },
                    files: ["utils/i18n.js", "utils/stations-data.js", "content/content.js"]
                  },
                  () => {
                    chrome.tabs.sendMessage(activeTab.id, {
                      action: "TRIGGER_AUTOFILL",
                      config: currentConfig
                    });
                  }
                );
              }
              showToast(getI18nText("statusAutofillSent"));
            }
          );
        } else {
          chrome.storage.local.set({ pendingAutoFillOnLoad: true }, () => {
            chrome.tabs.create({ url: "https://eticket.railway.gov.bd/" });
          });
        }
      });
    });
  });

  // Toast Utility
  let toastTimeout = null;
  function showToast(msg) {
    els.statusToast.textContent = msg;
    els.statusToast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      els.statusToast.classList.add("hidden");
    }, 2400);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Boot
  populateStaticLists();
  loadConfig();
  updateClockAndCountdown();
  setInterval(updateClockAndCountdown, 1000);
});
