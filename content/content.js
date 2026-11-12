/**
 * Railway QuickBook – Content Script & Angular SPA Autofill Engine (Phase 4 & 5)
 * Target: https://eticket.railway.gov.bd/*
 * Full bilingual support (English & Bangla)
 */

(() => {
  // Prevent multiple injections on the same tab
  if (window.__RQB_INITIALIZED__) return;
  window.__RQB_INITIALIZED__ = true;

  const fallbackDefault = (window.RAILWAY_DATA && window.RAILWAY_DATA.defaultConfig) || {
    lang: "en",
    enabled: true,
    fromStation: "Dhaka",
    toStation: "Chattogram",
    journeyDate: "",
    seatClass: "S_CHAIR",
    adultCount: 1,
    childCount: 0,
    preferredTrains: ["SUBORNO EXPRESS", "SONAR BANGLA EXPRESS"],
    coPassengers: [],
    options: {
      autoSubmitSearch: true,
      autoHighlightTrains: true,
      autoScrollToPreferred: true,
      autoExpandPreferredClass: true,
      dimNonPreferredTrains: false,
      showFloatingWidget: true
    }
  };

  let config = structuredClone(fallbackDefault);
  let hasScrolledCurrentSearch = false;
  let hasAutoBookedCurrentSearch = false;
  let lastAutoBookTime = 0;
  let lastUrl = location.href;

  // =========================================================================
  // 1. Helpers: i18n, Date Formatting & Angular Native Value Setter
  // =========================================================================

  function getI18n(key, interpolations = {}) {
    const lang = config.lang || "en";
    const dict = (window.RQB_I18N && window.RQB_I18N[lang]) || (window.RQB_I18N && window.RQB_I18N.en) || {};
    let text = dict[key] || "";
    Object.keys(interpolations).forEach((k) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), interpolations[k]);
    });
    return text;
  }

  function formatToRailwayDate(isoDate) {
    if (!isoDate) return "";
    // Convert YYYY-MM-DD -> DD-MMM-YYYY (e.g. 20-Nov-2026)
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const mIdx = parseInt(parts[1], 10) - 1;
    return `${parts[2]}-${months[mIdx] || parts[1]}-${parts[0]}`;
  }

  /**
   * Sets value on an HTMLInputElement or HTMLSelectElement in a way that
   * Angular FormControl / NgModel and jQuery listeners detect immediately.
   */
  function setNativeValue(element, value) {
    if (!element) return false;
    const tag = element.tagName.toLowerCase();
    const proto =
      tag === "select"
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

    element.focus();
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Find first matching visible element from a list of CSS selectors
  function queryFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // =========================================================================
  // 2. Search Form Autofill (From, To, Date, Seat Class, Search Submit)
  // =========================================================================

  async function fillStationField(inputEl, stationName) {
    if (!inputEl || !stationName) return false;
    setNativeValue(inputEl, stationName);
    await sleep(140);

    // Check if an autocomplete / typeahead list popped up (jQuery UI, Angular, or custom ul)
    const candidateItems = document.querySelectorAll(
      ".ui-autocomplete li, ul[id^='ui-id-'] li, .autocomplete-items div, .ng-dropdown-panel .ng-option, mat-option, .station-list li, ul.dropdown-menu li"
    );

    const targetLower = stationName.toLowerCase().replace(/_/g, " ");
    let clickedItem = false;

    for (const item of candidateItems) {
      if (item.offsetParent === null) continue; // skip hidden
      const text = (item.textContent || "").trim().toLowerCase().replace(/_/g, " ");
      if (text === targetLower || text.startsWith(targetLower) || text.includes(targetLower)) {
        item.click();
        clickedItem = true;
        break;
      }
    }

    if (!clickedItem) {
      inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      inputEl.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    return true;
  }

  async function fillDateField(dateEl, isoDate) {
    if (!dateEl || !isoDate) return false;
    const formatted = formatToRailwayDate(isoDate); // e.g., 20-Nov-2026
    const [, , dayNum] = isoDate.split("-");
    const dayInt = parseInt(dayNum, 10);

    const hadReadonly = dateEl.hasAttribute("readonly");
    if (hadReadonly) dateEl.removeAttribute("readonly");

    dateEl.click();
    setNativeValue(dateEl, formatted);
    await sleep(120);

    const dayCells = document.querySelectorAll(
      ".ui-datepicker-calendar td:not(.ui-datepicker-other-month):not(.ui-state-disabled) a, .mat-calendar-body-cell:not(.mat-calendar-body-disabled), .bs-datepicker-body td span:not(.disabled)"
    );

    for (const cell of dayCells) {
      if (cell.offsetParent === null) continue;
      const cellText = (cell.textContent || "").trim();
      if (parseInt(cellText, 10) === dayInt) {
        cell.click();
        break;
      }
    }

    if (!dateEl.value) {
      setNativeValue(dateEl, formatted);
    }
    dateEl.dispatchEvent(new Event("change", { bubbles: true }));
    dateEl.dispatchEvent(new Event("blur", { bubbles: true }));

    if (hadReadonly) dateEl.setAttribute("readonly", "true");
    return true;
  }

  async function fillSeatClassField(selectEl, seatClassCode) {
    if (!selectEl || !seatClassCode) return false;

    if (selectEl.tagName.toLowerCase() === "select") {
      const options = Array.from(selectEl.options || []);
      const match = options.find(
        (opt) =>
          opt.value.toUpperCase() === seatClassCode.toUpperCase() ||
          opt.textContent.toUpperCase().includes(seatClassCode.toUpperCase())
      );
      setNativeValue(selectEl, match ? match.value : seatClassCode);
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      selectEl.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    } else {
      selectEl.click();
      await sleep(100);
      setNativeValue(selectEl, seatClassCode);
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  async function autofillSearchForm(forceSubmit = null) {
    if (config.enabled === false) {
      updateWidgetStatus(config.lang === "bn" ? "⏸️ QuickBook বন্ধ (OFF) আছে। আগে ON করুন।" : "⏸️ QuickBook is Paused (OFF). Please turn ON first.");
      return;
    }
    updateWidgetStatus(getI18n("widgetAutofilling"));

    const fromInput = queryFirst([
      "#dest_from",
      "input[formcontrolname='dest_from']",
      "input[formcontrolname='from_station']",
      "input[name='dest_from']",
      "input[placeholder*='From Station' i]",
      "input[placeholder*='From' i]"
    ]);

    const toInput = queryFirst([
      "#dest_to",
      "input[formcontrolname='dest_to']",
      "input[formcontrolname='to_station']",
      "input[name='dest_to']",
      "input[placeholder*='To Station' i]",
      "input[placeholder*='To' i]"
    ]);

    const dateInput = queryFirst([
      "#doj",
      "input[formcontrolname='doj']",
      "input[name='doj']",
      "input[placeholder*='Date' i]",
      "input[placeholder*='Pick a date' i]"
    ]);

    const classSelect = queryFirst([
      "#choose_class",
      "select[formcontrolname='choose_class']",
      "select[name='choose_class']",
      "select#choose_class",
      "form select"
    ]);

    if (!fromInput && !toInput && !dateInput) {
      const paxFilled = autofillPassengerDetails();
      if (paxFilled > 0) {
        updateWidgetStatus(getI18n("widgetPaxFilled", { count: paxFilled }));
        return;
      }
      highlightPreferredTrains();
      updateWidgetStatus(getI18n("widgetFormNotFound"));
      return;
    }

    if (fromInput) await fillStationField(fromInput, config.fromStation);
    await sleep(100);
    if (toInput) await fillStationField(toInput, config.toStation);
    await sleep(100);
    if (dateInput) await fillDateField(dateInput, config.journeyDate);
    await sleep(100);
    if (classSelect) await fillSeatClassField(classSelect, config.seatClass);

    updateWidgetStatus(getI18n("widgetAutofillDone"));

    const shouldSubmit =
      forceSubmit !== null ? forceSubmit : !!(config.options && config.options.autoSubmitSearch);

    if (shouldSubmit) {
      await sleep(180);
      const searchBtn =
        queryFirst([
          "button.railway-ticket-search-submit-btn",
          "form button[type='submit']",
          ".search-form button[type='submit']"
        ]) ||
        Array.from(document.querySelectorAll("button")).find((b) =>
          /search\s*trains/i.test(b.textContent || "")
        );

      if (searchBtn && !searchBtn.disabled) {
        hasScrolledCurrentSearch = false;
        searchBtn.click();
        updateWidgetStatus(getI18n("widgetSearchClicked"));
      }
    }
  }

  // =========================================================================
  // 3. Preferred Train & Seat Class Highlighter on Search Results
  // =========================================================================

  function normalizeTrainString(str) {
    return (str || "")
      .toUpperCase()
      .replace(/['’`._\-\s]/g, "");
  }

  /**
   * Robust matching for train titles:
   * Checks whether a candidate text element inside a card matches the target preferred train.
   */
  function isTrainTitleMatch(txt, pref) {
    if (!txt || !pref) return false;
    const normTxt = normalizeTrainString(txt);
    const normPref = normalizeTrainString(pref);
    if (!normTxt || !normPref) return false;

    // 1. Direct normalized substring match (e.g. "COXSBAZAREXPRESS(814)" contains "COXSBAZAREXPRESS")
    if (normTxt.includes(normPref)) {
      return true;
    }

    // 2. Direct train number match if pref contains numbers (e.g. "814" or "813/814")
    const prefNumbers = pref.match(/\b\d{3,4}\b/g);
    if (prefNumbers) {
      for (const num of prefNumbers) {
        if (new RegExp(`\\b${num}\\b`).test(txt) || normTxt.includes(num)) return true;
      }
    }

    // 3. Match via popularTrains DB numbers (e.g. "COX'S BAZAR EXPRESS" -> numbers: ["813", "814"])
    if (window.RAILWAY_DATA && window.RAILWAY_DATA.popularTrains) {
      const matchInDb = window.RAILWAY_DATA.popularTrains.find(
        (t) =>
          normalizeTrainString(t.name) === normPref ||
          normPref.includes(normalizeTrainString(t.name))
      );
      if (matchInDb && matchInDb.numbers) {
        for (const num of matchInDb.numbers) {
          if (new RegExp(`\\b${num}\\b`).test(txt) || normTxt.includes(num)) {
            // Guard: Ignore if this text is purely a station arrival/departure line without train number/name
            if (/\b(?:from|to|station|dhaka|chattogram|sylhet)\b/i.test(txt) && !/\(\d{3,4}\)/.test(txt)) {
              continue;
            }
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Checks if an entire trip card matches the target preferred train.
   */
  function isCardMatch(card, targetPref) {
    if (!card || !targetPref) return false;

    // Clone card to strip out any existing badges, widgets, etc.
    const clone = card.cloneNode(true);
    clone.querySelectorAll(".rqb-preferred-badge, #rqb-floating-widget, .rqb-preferred-seat-class").forEach((el) => el.remove());

    // 1. Look for explicit train header / title element
    const titleEls = clone.querySelectorAll(
      "h1, h2, h3, h4, h5, .train-name, .trip-name, .trip-title, [class*='train-name'], [class*='trip-name']"
    );
    for (const el of titleEls) {
      const txt = (el.textContent || "").trim();
      if (txt && isTrainTitleMatch(txt, targetPref)) return true;
    }

    // 2. Check top elements of the card (train header section)
    const allTextEls = Array.from(clone.querySelectorAll("div, span, p, strong, b")).slice(0, 20);
    for (const el of allTextEls) {
      if (el.children.length > 2) continue;
      const txt = (el.textContent || "").trim();
      if (txt.length >= 3 && txt.length <= 65 && isTrainTitleMatch(txt, targetPref)) {
        return true;
      }
    }

    // 3. Fallback: check first few non-empty text lines of the card
    const cardText = clone.innerText || clone.textContent || "";
    const firstLines = cardText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4);
    for (const line of firstLines) {
      if (isTrainTitleMatch(line, targetPref)) return true;
    }

    return false;
  }

  let isApplyingHighlight = false;

  function highlightPreferredTrains() {
    if (isApplyingHighlight) return 0;
    isApplyingHighlight = true;
    try {
      return _executeHighlight();
    } finally {
      setTimeout(() => {
        isApplyingHighlight = false;
      }, 150);
    }
  }

  function _executeHighlight() {
    // If master toggle is OFF or highlight is disabled, remove any existing highlights and return
    if (config.enabled === false || (config.options && config.options.autoHighlightTrains === false)) {
      document.querySelectorAll(".rqb-preferred-train-card, .rqb-dimmed-train-card").forEach((el) => {
        el.classList.remove("rqb-preferred-train-card", "rqb-dimmed-train-card");
      });
      document.querySelectorAll(".rqb-preferred-badge").forEach((el) => el.remove());
      document.querySelectorAll(".rqb-preferred-seat-class").forEach((el) => el.classList.remove("rqb-preferred-seat-class"));
      return 0;
    }

    const preferredList = (config.preferredTrains || [])
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    // If no preferred trains configured, clean up any existing badges and highlights
    if (preferredList.length === 0) {
      document.querySelectorAll(".rqb-preferred-train-card, .rqb-dimmed-train-card").forEach((el) => {
        el.classList.remove("rqb-preferred-train-card", "rqb-dimmed-train-card");
      });
      document.querySelectorAll(".rqb-preferred-badge").forEach((el) => el.remove());
      document.querySelectorAll(".rqb-preferred-seat-class").forEach((el) => el.classList.remove("rqb-preferred-seat-class"));
      return 0;
    }

    // User requirement: If multiple preferred trains exist, ONLY the top #1 match is selected with border!
    const targetPref = preferredList[0];

    const allCandidates = Array.from(
      document.querySelectorAll(
        "app-single-trip, .single-trip-wrapper, .trip-card, .train-card"
      )
    );

    // If app-single-trip tags are present, prioritize them exclusively to avoid nested duplicates
    const appSingleTrips = allCandidates.filter((el) => el.tagName.toLowerCase() === "app-single-trip");
    let cards = appSingleTrips.length > 0 ? appSingleTrips : allCandidates;

    // Filter out any element that is contained within another candidate card
    cards = cards.filter((el) => !cards.some((parent) => parent !== el && parent.contains(el)));

    if (cards.length === 0) {
      const headings = Array.from(document.querySelectorAll("h2, h3, h4, h5, .train-name, .trip-title")).filter(
        (h) => /\(\d{3,4}\)/.test(h.textContent || "")
      );
      cards = headings
        .map((h) => h.closest("app-single-trip, .single-trip-wrapper, .trip-card, .train-card, .card") || h.parentElement)
        .filter((c, idx, self) => c && self.indexOf(c) === idx);
    }

    if (cards.length === 0) return 0;

    let targetCard = null;

    // Find the one card that matches targetPref (#1 priority)
    for (const card of cards) {
      if (isCardMatch(card, targetPref)) {
        targetCard = card;
        break;
      }
    }

    // Apply / remove highlights strictly: ONLY targetCard gets the border & badge
    cards.forEach((card) => {
      if (card === targetCard) {
        if (!card.classList.contains("rqb-preferred-train-card")) {
          card.classList.add("rqb-preferred-train-card");
        }
        card.classList.remove("rqb-dimmed-train-card");

        const badgePrefix = getI18n("widgetTrainBadge") || "★ আপনার পছন্দের ট্রেন — Priority #";
        const classLabel = config.lang === "bn" ? "লক্ষ্য ক্লাস:" : "Target Class:";
        const badgeHtml = `${badgePrefix}1 (${targetPref}) • ${classLabel} ${config.seatClass}`;

        let badge = card.querySelector(".rqb-preferred-badge");
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "rqb-preferred-badge";
          badge.innerHTML = badgeHtml;
          card.prepend(badge);
        } else if (badge.innerHTML !== badgeHtml) {
          badge.innerHTML = badgeHtml;
        }

        // Clean up any extra duplicate badges inside this card
        const extraBadges = Array.from(card.querySelectorAll(".rqb-preferred-badge")).slice(1);
        if (extraBadges.length > 0) {
          extraBadges.forEach((b) => b.remove());
        }

        highlightSeatClassInCard(card, config.seatClass);
      } else {
        // Any other train card must NOT have the border, badge, or class outline
        card.classList.remove("rqb-preferred-train-card");
        card.querySelectorAll(".rqb-preferred-badge").forEach((b) => b.remove());
        card.querySelectorAll(".rqb-preferred-seat-class").forEach((sc) => sc.classList.remove("rqb-preferred-seat-class"));

        if (config.options && config.options.dimNonPreferredTrains) {
          card.classList.add("rqb-dimmed-train-card");
        } else {
          card.classList.remove("rqb-dimmed-train-card");
        }
      }
    });

    if (targetCard) {
      if (!hasScrolledCurrentSearch && (!config.options || config.options.autoScrollToPreferred !== false)) {
        hasScrolledCurrentSearch = true;
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      updateWidgetStatus(getI18n("widgetTrainsFound", { count: 1 }));

      // Auto-book preferred seat class (defaults to true unless explicitly disabled)
      const seatsOpen = findSeatElementsOnPage().length > 0;
      if (!seatsOpen && (!config.options || config.options.autoExpandPreferredClass !== false)) {
        setTimeout(() => {
          tryAutoBookPreferredClass(targetCard);
        }, 250);
      }

      return 1;
    }

    return 0;
  }

  function isBookNowButton(el) {
    if (!el) return false;
    if (el.closest && el.closest("#rqb-floating-widget, .rqb-preferred-badge")) return false;
    const txt = (el.textContent || el.innerText || "").trim();
    return /book\s*now|বুক\s*করুন/i.test(txt);
  }

  function getBookNowButtonsIn(root) {
    if (!root) return [];
    return Array.from(
      root.querySelectorAll("button, a, [role='button'], div.btn, span.btn, .book-now-btn")
    ).filter(isBookNowButton);
  }

  function findClassColumns(trainCard) {
    if (!trainCard) return [];

    // Find all candidate "BOOK NOW" buttons inside the card
    const bookBtns = getBookNowButtonsIn(trainCard);

    return bookBtns.map((btn) => {
      // Find the specific column container for this button
      let container = btn.parentElement;
      while (
        container &&
        container.parentElement &&
        container.parentElement !== trainCard &&
        !container.parentElement.classList.contains("trip-wrapper") &&
        !container.parentElement.classList.contains("single-trip-wrapper") &&
        getBookNowButtonsIn(container.parentElement).length <= 1
      ) {
        container = container.parentElement;
      }

      // Read text of the column, strictly ignoring our injected badge or floating widget
      const clone = container.cloneNode(true);
      clone.querySelectorAll(".rqb-preferred-badge, #rqb-floating-widget").forEach((el) => el.remove());
      const rawText = (clone.textContent || clone.innerText || "").toUpperCase().replace(/[\s-]/g, "_");

      return {
        container,
        btn,
        text: rawText
      };
    });
  }

  function matchColumnForClass(cols, targetClassCode) {
    if (!cols || cols.length === 0 || !targetClassCode) return null;
    const cleanTarget = targetClassCode.trim().toUpperCase().replace(/[\s-]/g, "_");

    return cols.find((c) => {
      if (cleanTarget === "SNIGDHA") {
        return (c.text.includes("SNIGDHA") || c.text.includes("স্নিগ্ধা")) && !c.text.includes("S_CHAIR");
      }
      if (cleanTarget === "S_CHAIR") {
        return (c.text.includes("S_CHAIR") || c.text.includes("SHOVON_CHAIR") || c.text.includes("SHOVON") || c.text.includes("শোভন")) && !c.text.includes("AC_S") && !c.text.includes("SNIGDHA");
      }
      if (cleanTarget === "AC_S") {
        return (c.text.includes("AC_S") || c.text.includes("AC_CHAIR")) && !c.text.includes("S_CHAIR") && !c.text.includes("SNIGDHA") && !c.text.includes("AC_B");
      }
      if (cleanTarget === "AC_B") {
        return (c.text.includes("AC_B") || c.text.includes("BERTH") || c.text.includes("বার্থ")) && !c.text.includes("AC_S") && !c.text.includes("SNIGDHA");
      }
      return c.text.includes(cleanTarget);
    });
  }

  function findColumnByTextSearch(trainCard, targetClassCode) {
    if (!trainCard || !targetClassCode) return null;
    const cleanTarget = targetClassCode.trim().toUpperCase().replace(/[\s-]/g, "_");

    const allEls = Array.from(trainCard.querySelectorAll("h2, h3, h4, h5, h6, div, span, b, strong, p"));
    for (const el of allEls) {
      if (el.closest("#rqb-floating-widget, .rqb-preferred-badge")) continue;
      if (el.children.length > 2) continue;
      const txt = (el.textContent || "").trim().toUpperCase().replace(/[\s-]/g, "_");
      if (!txt) continue;

      let isMatch = false;
      if (cleanTarget === "SNIGDHA") {
        isMatch = (txt.includes("SNIGDHA") || txt.includes("স্নিগ্ধা")) && !txt.includes("S_CHAIR");
      } else if (cleanTarget === "S_CHAIR") {
        isMatch = (txt.includes("S_CHAIR") || txt.includes("SHOVON_CHAIR") || txt.includes("SHOVON") || txt.includes("শোভন")) && !txt.includes("AC_S") && !txt.includes("SNIGDHA");
      } else if (cleanTarget === "AC_S") {
        isMatch = (txt.includes("AC_S") || txt.includes("AC_CHAIR") || txt.includes("এসি")) && !txt.includes("S_CHAIR") && !txt.includes("SNIGDHA") && !txt.includes("AC_B");
      } else if (cleanTarget === "AC_B") {
        isMatch = (txt.includes("AC_B") || txt.includes("BERTH") || txt.includes("বার্থ")) && !txt.includes("AC_S") && !txt.includes("SNIGDHA");
      } else {
        isMatch = txt.includes(cleanTarget);
      }

      if (isMatch) {
        let box = el.parentElement;
        while (box && box !== trainCard && getBookNowButtonsIn(box).length === 0) {
          box = box.parentElement;
        }
        if (box && box !== trainCard && getBookNowButtonsIn(box).length >= 1) {
          const btns = getBookNowButtonsIn(box);
          return {
            container: box,
            btn: btns[0]
          };
        }
      }
    }
    return null;
  }

  function highlightSeatClassInCard(trainCard, targetClassCode) {
    if (!trainCard || !targetClassCode) return null;

    // Clean up existing class highlights
    trainCard.querySelectorAll(".rqb-preferred-seat-class").forEach((el) => el.classList.remove("rqb-preferred-seat-class"));

    const cols = findClassColumns(trainCard);
    let matchedCol = matchColumnForClass(cols, targetClassCode);
    if (!matchedCol) {
      matchedCol = findColumnByTextSearch(trainCard, targetClassCode);
    }

    if (matchedCol && matchedCol.container) {
      matchedCol.container.classList.add("rqb-preferred-seat-class");
      return matchedCol.container;
    }

    return null;
  }

  // =========================================================================
  // 3.1 Auto-Click "Book Now" & Smart Seat Selection Engine
  // =========================================================================

  function isSeatLayoutExpanded() {
    return findSeatElementsOnPage().length > 0;
  }

  function getCurrentOpenSeatClass() {
    const seatBox = getSeatContainer();
    if (!seatBox) return null;

    const detailsText = (seatBox.textContent || seatBox.innerText || "").toUpperCase().replace(/[\s-]/g, "_");
    if (detailsText.includes("SNIGDHA") || detailsText.includes("স্নিগ্ধা")) return "SNIGDHA";
    if (detailsText.includes("S_CHAIR") || detailsText.includes("SHOVON_CHAIR") || detailsText.includes("SHOVON")) return "S_CHAIR";
    if (detailsText.includes("AC_S") || detailsText.includes("AC_CHAIR")) return "AC_S";
    if (detailsText.includes("AC_B") || detailsText.includes("BERTH")) return "AC_B";

    return null;
  }

  function clickBookButton(btn) {
    if (!btn) return;
    try { btn.focus(); } catch (_) { }

    try {
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    } catch (_) { }

    try {
      btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    } catch (_) { }

    try {
      btn.click();
    } catch (_) {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
  }

  function triggerSingleClick(targetEl) {
    clickBookButton(targetEl);
  }

  function findTargetClassBookButton(trainCard, targetBox) {
    if (!trainCard) return null;

    const cols = findClassColumns(trainCard);
    const matchedCol = matchColumnForClass(cols, config.seatClass);

    if (matchedCol && matchedCol.btn) {
      return matchedCol.btn;
    }

    // Direct text search fallback
    const directMatch = findColumnByTextSearch(trainCard, config.seatClass);
    if (directMatch && directMatch.btn) {
      return directMatch.btn;
    }

    // If targetBox is given, check if any col container matches or is within targetBox
    if (targetBox) {
      const colByBox = cols.find((c) => c.container === targetBox || c.container.contains(targetBox) || targetBox.contains(c.container));
      if (colByBox && colByBox.btn) return colByBox.btn;
    }

    // Return null if target class was not matched (DO NOT click random wrong class button!)
    return null;
  }

  let isAutoBooking = false;

  async function tryAutoBookPreferredClass(trainCard) {
    if (config.enabled === false) return false;
    if (!trainCard) return false;
    if (config.options && config.options.autoExpandPreferredClass === false) return false;
    if (isAutoBooking) return false;

    // Check if seats are ALREADY visible on the page
    const existingSeats = findSeatElementsOnPage();
    if (existingSeats.length > 0) {
      const openClass = getCurrentOpenSeatClass();
      if (!openClass || openClass === config.seatClass) {
        hasAutoBookedCurrentSearch = true;
        autoSelectSeats(existingSeats);
        return true;
      }
      // If currently open seat class does NOT match config.seatClass (e.g. S_CHAIR is open, but target is SNIGDHA),
      // do NOT select wrong class seats! Proceed below to click Book Now on config.seatClass.
      console.log(`[Railway QuickBook] Open seat map is '${openClass}', but preferred is '${config.seatClass}'. Switching to '${config.seatClass}'...`);
    }

    isAutoBooking = true;
    try {
      // 1. Ensure the seat class is highlighted
      let targetBox = trainCard.querySelector(".rqb-preferred-seat-class");
      if (!targetBox) {
        highlightSeatClassInCard(trainCard, config.seatClass);
        targetBox = trainCard.querySelector(".rqb-preferred-seat-class");
      }

      // 2. Find the Book Now button
      let bookBtn = findTargetClassBookButton(trainCard, targetBox);
      if (!bookBtn) {
        console.warn("[Railway QuickBook] Book Now button not found for class:", config.seatClass);
        updateWidgetStatus(
          config.lang === "bn"
            ? `⚠️ '${config.seatClass}' ক্লাসের বুকিং বাটন মেলেনি`
            : `⚠️ Book Now button not found for '${config.seatClass}'`
        );
        return false;
      }

      updateWidgetStatus(
        config.lang === "bn"
          ? `⚡ '${config.seatClass}' ক্লাসে বুক নাও ক্লিক করা হচ্ছে...`
          : `⚡ Clicking Book Now for '${config.seatClass}'...`
      );

      // Scroll button into view smoothly
      bookBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(200);

      // Click the Book Now button
      clickBookButton(bookBtn);

      hasAutoBookedCurrentSearch = true;
      hasAutoSelectedSeatsOnCurrentView = false;

      // Start waiting for the seat layout to expand and auto-select seats
      waitForSeatLayoutAndAutoSelect(14000, true);

      // Verification: Check after 900ms if seats appeared. If not, retry click once!
      setTimeout(() => {
        if (config.enabled === false) return;
        const seatsNow = findSeatElementsOnPage();
        if (seatsNow.length === 0) {
          console.log("[Railway QuickBook] Retrying Book Now click...");
          clickBookButton(bookBtn);
          setTimeout(() => {
            if (config.enabled === false) return;
            waitForSeatLayoutAndAutoSelect(14000);
          }, 300);
        }
      }, 900);

      return true;
    } finally {
      setTimeout(() => {
        isAutoBooking = false;
      }, 2000);
    }
  }

  function triggerElementClick(targetEl) {
    clickBookButton(targetEl);
  }

  let isSelectingSeats = false;
  let hasAutoSelectedSeatsOnCurrentView = false;
  let visitedCoaches = new Set();
  let bestFallbackCoachSeats = null;

  function waitForSeatLayoutAndAutoSelect(maxWaitMs = 14000, isFreshSearch = false) {
    if (config.enabled === false) return;
    if (isFreshSearch) {
      visitedCoaches.clear();
      bestFallbackCoachSeats = null;
    }
    const startTime = Date.now();
    updateWidgetStatus(config.lang === "bn" ? "🔍 কোচের সিট ম্যাপ খোঁজা হচ্ছে..." : "🔍 Waiting for coach seat layout...");

    const interval = setInterval(() => {
      if (config.enabled === false || Date.now() - startTime > maxWaitMs) {
        clearInterval(interval);
        return;
      }
      const seatElements = findSeatElementsOnPage();
      if (seatElements.length > 0) {
        clearInterval(interval);
        autoSelectSeats(seatElements);
      }
    }, 300);
  }

  function extractSeatNameFromElement(el) {
    if (!el) return "";
    const txt = (el.innerText || el.textContent || "").trim();
    // Matches patterns like "NEO-1", "KHA-24", "ক-১", "NEO - 1"
    const m = txt.match(/(?:^|\s|>|:)([A-Za-z0-9\u0980-\u09FF]{1,8}\s*-\s*[0-9\u09E6-\u09EF]{1,3})(?:$|\s|<|\n)/u);
    return m ? m[1].replace(/\s+/g, "") : "";
  }

  function getSeatContainer() {
    // 1. Known seat container selectors
    const container = document.querySelector(
      "app-seat-layout, app-trip-seat, app-coach-seat-view, .seat-layout, .coach-layout, .seat-plan, .seat-map, .trip-seats, .seat-view, #mockSeatLayoutCard, [class*='seat-layout'], [class*='seat-map'], [class*='seat-plan']"
    );
    if (container) return container;

    // 2. Any element containing seat buttons or seat text
    const candidateSeat = Array.from(document.querySelectorAll("button, .seat, app-seat, [class*='seat']")).find((el) => {
      if (el.closest("#rqb-floating-widget, .rqb-preferred-badge")) return false;
      return extractSeatNameFromElement(el) !== "";
    });

    if (candidateSeat) {
      return (
        candidateSeat.closest("app-seat-layout, app-trip-seat, .seat-layout, .coach-layout, .card, div[class*='seat'], div[class*='coach']") ||
        candidateSeat.parentElement.parentElement ||
        document.body
      );
    }

    return null;
  }

  function findSeatElementsOnPage() {
    const container = getSeatContainer();
    if (!container) return [];

    // Bangladesh Railway seats have format: "<BOGIE>-<NUMBER>" e.g. "NEO-1", "KHA-24", "ক-১"
    const candidates = Array.from(
      container.querySelectorAll(
        "button, .seat, app-seat, [class*='seat-btn'], [class*='seat'], div, span, a"
      )
    );

    const seatMap = new Map();

    candidates.forEach((el) => {
      if (el.closest("#rqb-floating-widget, .rqb-preferred-badge")) return;
      const name = extractSeatNameFromElement(el);
      if (!name) return;

      // Find the best interactive container
      const interactiveEl = el.closest("button, a, [role='button'], .seat, [class*='seat-btn'], [class*='seat']") || el;

      // Prefer the interactive container if already found
      if (!seatMap.has(name)) {
        seatMap.set(name, { el: interactiveEl, name });
      } else {
        const existing = seatMap.get(name);
        // If current element is a button or has seat class, upgrade to it
        if (
          interactiveEl.tagName.toLowerCase() === "button" ||
          (interactiveEl.className && String(interactiveEl.className).includes("seat"))
        ) {
          seatMap.set(name, { el: interactiveEl, name });
        }
      }
    });

    return Array.from(seatMap.values()).map((item) => item.el);
  }

  function isSeatAvailable(el) {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (el.getAttribute("disabled") !== null) return false;

    // Check class names on element and ancestors
    const elementsToCheck = [
      el,
      el.parentElement,
      el.closest("[class*='seat'], button, div")
    ].filter(Boolean);

    for (const node of elementsToCheck) {
      const cls = String(node.className || "").toLowerCase();
      if (
        cls.includes("booked") ||
        cls.includes("sold") ||
        cls.includes("occupied") ||
        cls.includes("disabled") ||
        cls.includes("unavailable") ||
        cls.includes("seat-booked") ||
        cls.includes("in-progress") ||
        cls.includes("inprogress") ||
        cls.includes("in_progress")
      ) {
        return false;
      }
      if (cls.includes("selected") || cls.includes("seat-selected")) {
        return false; // already selected
      }
    }

    // Check computed colors (Background / Fill / SVG)
    for (const node of elementsToCheck) {
      const style = window.getComputedStyle(node);
      const bg = style.backgroundColor || "";
      const fill = style.fill || "";
      const colorStr = bg.startsWith("rgb") ? bg : fill.startsWith("rgb") ? fill : "";

      const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const r = parseInt(m[1], 10);
        const g = parseInt(m[2], 10);
        const b = parseInt(m[3], 10);

        // Orange / Booked in BD Railway (e.g. #ea580c, #f97316)
        if (r > 170 && g < 165 && b < 100) return false;

        // Green / In-progress (e.g. #16a34a)
        if (g > 120 && r < 140 && b < 140) return false;

        // Navy / Selected (e.g. #1e3a8a)
        if (b > 100 && r < 80) return false;

        // White / Light Available (e.g. rgb(255, 255, 255))
        if (r > 200 && g > 200 && b > 200) return true;
      }
    }

    // Explicit available class
    for (const node of elementsToCheck) {
      const cls = String(node.className || "").toLowerCase();
      if (cls.includes("available") || cls.includes("seat-available") || cls.includes("vacant")) {
        return true;
      }
    }

    return true;
  }

  function analyzeSeatLayout(seatElements) {
    if (seatElements.length === 0) return { seats: [], maxRow: 0, maxCol: 0 };

    const rawSeats = seatElements.map((el) => {
      const rect = el.getBoundingClientRect();
      const seatName = extractSeatNameFromElement(el) || (el.textContent || "").trim();
      return {
        el,
        name: seatName,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        isAvailable: isSeatAvailable(el)
      };
    });

    // 1. Group by Y into rows (threshold 16px)
    rawSeats.sort((a, b) => a.y - b.y);
    let currentRow = 0;
    let lastY = rawSeats[0].y;
    rawSeats[0].row = 0;

    for (let i = 1; i < rawSeats.length; i++) {
      if (Math.abs(rawSeats[i].y - lastY) > 16) {
        currentRow++;
        lastY = rawSeats[i].y;
      }
      rawSeats[i].row = currentRow;
    }
    const maxRow = currentRow;

    // 2. Group by X into distinct columns (threshold 16px)
    const allX = rawSeats.map((s) => s.x).sort((a, b) => a - b);
    const colCenters = [];
    for (const x of allX) {
      const existing = colCenters.find((c) => Math.abs(c - x) < 16);
      if (!existing) {
        colCenters.push(x);
      }
    }
    colCenters.sort((a, b) => a - b);
    const maxCol = Math.max(0, colCenters.length - 1);

    rawSeats.forEach((s) => {
      let closestCol = 0;
      let minDiff = Infinity;
      colCenters.forEach((cx, idx) => {
        const diff = Math.abs(cx - s.x);
        if (diff < minDiff) {
          minDiff = diff;
          closestCol = idx;
        }
      });
      s.col = closestCol;
      s.isWindow = closestCol === 0 || closestCol === maxCol;
      s.isAisle = closestCol > 0 && closestCol < maxCol;
    });

    return { seats: rawSeats, maxRow, maxCol };
  }

  function findCoachSelector() {
    // 1. Direct query selectors
    const standard = queryFirst([
      "select[formcontrolname*='bogie' i]",
      "select[formcontrolname*='coach' i]",
      "select[name*='bogie' i]",
      "select[name*='coach' i]",
      ".coach-select select",
      ".bogie-select select",
      "select#bogie",
      "select#coach"
    ]);
    if (standard) return { type: "select", el: standard };

    // 2. Any <select> on the page whose options contain "Seat" / "Seat(s)" / coach patterns
    const allSelects = Array.from(document.querySelectorAll("select"));
    for (const sel of allSelects) {
      if (sel.options && sel.options.length > 0) {
        const textAll = Array.from(sel.options).map((o) => (o.text || o.innerText || "").trim()).join(" ");
        if (/seat\(s\)|seat|coach|bogie|কোচ|বগি/i.test(textAll)) {
          return { type: "select", el: sel };
        }
      }
    }

    // 3. Near "Select Coach" / "কোচ" label
    const labels = Array.from(document.querySelectorAll("label, span, div, p, strong, h3, h4, h5"));
    const coachLabel = labels.find((l) => /select\s*coach|কোচ\s*নির্বাচন/i.test((l.textContent || "").trim()));
    if (coachLabel) {
      const container = coachLabel.closest(".card, .seat-layout, div") || coachLabel.parentElement;
      const nearSelect = container ? container.querySelector("select") : null;
      if (nearSelect) return { type: "select", el: nearSelect };
      const nearNg = container ? container.querySelector("ng-select, .ng-select") : null;
      if (nearNg) return { type: "ng-select", el: nearNg };
    }

    // 4. Angular ng-select
    const ngSelect = document.querySelector(
      "ng-select[formcontrolname*='bogie' i], ng-select[formcontrolname*='coach' i], ng-select.coach-select, ng-select[class*='coach' i]"
    );
    if (ngSelect) return { type: "ng-select", el: ngSelect };

    // 5. Coach tabs / pills
    const tabs = Array.from(
      document.querySelectorAll(".coach-tab, .bogie-tab, button[class*='coach'], button[class*='bogie']")
    ).filter((el) => el.offsetParent !== null);
    if (tabs.length > 0) return { type: "tabs", elements: tabs };

    return null;
  }

  function getCoachList(selectorObj) {
    if (!selectorObj) return [];
    if (selectorObj.type === "select") {
      const sel = selectorObj.el;
      return Array.from(sel.options).map((opt, idx) => {
        const rawText = (opt.text || opt.innerText || "").trim();
        const m = rawText.match(/(\d+)\s*(?:seat|টি|সিট)/i);
        const count = m ? parseInt(m[1], 10) : -1;
        const nameMatch = rawText.match(/^([A-Za-z0-9\u0980-\u09FF]+)/);
        const name = nameMatch ? nameMatch[1] : rawText;
        return {
          idx,
          value: opt.value,
          text: rawText,
          name,
          availableSeats: count,
          isSelected: sel.selectedIndex === idx
        };
      });
    }

    if (selectorObj.type === "tabs") {
      return selectorObj.elements.map((tab, idx) => {
        const rawText = (tab.textContent || "").trim();
        const m = rawText.match(/(\d+)/);
        return {
          idx,
          element: tab,
          text: rawText,
          name: rawText,
          availableSeats: m ? parseInt(m[1], 10) : -1,
          isSelected: tab.classList.contains("active") || tab.classList.contains("selected")
        };
      });
    }

    if (selectorObj.type === "ng-select") {
      const ng = selectorObj.el;
      const currentValEl = ng.querySelector(".ng-value-label, .ng-value, [class*='value']");
      const currentText = (currentValEl ? currentValEl.textContent : ng.textContent || "").trim();
      const nameMatch = currentText.match(/^([A-Za-z0-9\u0980-\u09FF]+)/);
      const currentName = nameMatch ? nameMatch[1] : currentText;
      return [{
        idx: 0,
        text: currentText,
        name: currentName,
        availableSeats: -1,
        isSelected: true
      }];
    }

    return [];
  }

  function switchToCoach(selectorObj, coachItem) {
    if (!selectorObj || !coachItem) return false;

    if (selectorObj.type === "select") {
      const sel = selectorObj.el;
      sel.selectedIndex = coachItem.idx;
      setNativeValue(sel, coachItem.value);
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (selectorObj.type === "tabs") {
      triggerElementClick(coachItem.element);
      return true;
    }

    if (selectorObj.type === "ng-select") {
      triggerElementClick(selectorObj.el);
      setTimeout(() => {
        const options = Array.from(document.querySelectorAll(".ng-dropdown-panel .ng-option, .ng-option"));
        const match = options.find((o) => (o.textContent || "").trim().includes(coachItem.name));
        if (match) {
          triggerElementClick(match);
        } else {
          const unselected = options.filter((o) => !o.classList.contains("ng-option-selected"));
          if (unselected.length > 0) triggerElementClick(unselected[0]);
        }
      }, 200);
      return true;
    }

    return false;
  }

  function trySwitchToNextCoach() {
    const coachSelector = findCoachSelector();
    const coaches = getCoachList(coachSelector);
    const unvisited = coaches.filter((c) => !visitedCoaches.has(c.name) && !c.isSelected);
    if (unvisited.length > 0) {
      const target = unvisited[0];
      visitedCoaches.add(target.name);
      updateWidgetStatus(
        config.lang === "bn"
          ? `🔄 পরবর্তী কোচে খোঁজা হচ্ছে (${target.name})...`
          : `🔄 Checking next coach (${target.name})...`
      );
      switchToCoach(coachSelector, target);
      setTimeout(() => {
        hasAutoSelectedSeatsOnCurrentView = false;
        waitForSeatLayoutAndAutoSelect(8000);
      }, 600);
      return true;
    }
    return false;
  }

  function getPhysicalPairs(availableSeats) {
    const pairs = [];
    const rows = new Map();
    availableSeats.forEach((s) => {
      if (!rows.has(s.row)) rows.set(s.row, []);
      rows.get(s.row).push(s);
    });

    for (const [r, rowSeats] of rows.entries()) {
      rowSeats.sort((a, b) => a.col - b.col);
      for (let i = 0; i < rowSeats.length - 1; i++) {
        if (Math.abs(rowSeats[i].col - rowSeats[i + 1].col) === 1) {
          pairs.push({
            row: r,
            s1: rowSeats[i],
            s2: rowSeats[i + 1],
            col1: rowSeats[i].col,
            col2: rowSeats[i + 1].col
          });
        }
      }
    }
    return pairs;
  }

  function findColumnSeats(availableSeats, count) {
    if (!availableSeats || availableSeats.length < count) return null;

    // 1. Geometric check: consecutive rows in same column (সামনে পেছনে)
    const cols = new Map();
    availableSeats.forEach((s) => {
      if (!cols.has(s.col)) cols.set(s.col, []);
      cols.get(s.col).push(s);
    });

    for (const [, colSeats] of cols.entries()) {
      colSeats.sort((a, b) => a.row - b.row);
      for (let i = 0; i <= colSeats.length - count; i++) {
        let isConsecutive = true;
        for (let j = 0; j < count - 1; j++) {
          if (Math.abs(colSeats[i + j + 1].row - colSeats[i + j].row) !== 1) {
            isConsecutive = false;
            break;
          }
        }
        if (isConsecutive) return colSeats.slice(i, i + count);
      }
    }

    // 2. Numeric difference of 4 in same column (N, N+4, N+8, ...)
    const numMap = new Map();
    availableSeats.forEach((s) => {
      const n = parseSeatNumber(s.name);
      if (n > 0) numMap.set(n, s);
    });

    for (const s of availableSeats) {
      const n = parseSeatNumber(s.name);
      if (n <= 0) continue;
      let allFound = true;
      const group = [s];
      for (let step = 1; step < count; step++) {
        if (numMap.has(n + step * 4)) {
          group.push(numMap.get(n + step * 4));
        } else {
          allFound = false;
          break;
        }
      }
      if (allFound) return group;
    }

    return null;
  }

  function findPashapashiPair(availableSeats) {
    if (!availableSeats || availableSeats.length < 2) return null;

    // 1. Physical side-by-side pair in same row
    const physicalPairs = getPhysicalPairs(availableSeats);
    if (physicalPairs.length > 0) {
      return [physicalPairs[0].s1, physicalPairs[0].s2];
    }

    // 2. Numeric difference of 1 in row
    const numMap = new Map();
    availableSeats.forEach((s) => {
      const n = parseSeatNumber(s.name);
      if (n > 0) numMap.set(n, s);
    });

    for (const s of availableSeats) {
      const n = parseSeatNumber(s.name);
      if (n > 0) {
        if (numMap.has(n + 1) && Math.abs(s.row - numMap.get(n + 1).row) <= 1) {
          return [s, numMap.get(n + 1)];
        }
        if (numMap.has(n - 1) && Math.abs(s.row - numMap.get(n - 1).row) <= 1) {
          return [s, numMap.get(n - 1)];
        }
        const partner = getPashapashiPartnerNum(n);
        if (partner && numMap.has(partner)) {
          return [s, numMap.get(partner)];
        }
      }
    }

    return null;
  }

  function findFrontBackPair(availableSeats) {
    return findColumnSeats(availableSeats, 2);
  }

  function find2x2Block(availableSeats) {
    if (!availableSeats || availableSeats.length < 4) return null;

    // 1. Physical 2x2: Two side-by-side seats in row r, and two side-by-side seats in row r+1 at matching columns!
    const pairs = getPhysicalPairs(availableSeats);
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const p1 = pairs[i];
        const p2 = pairs[j];
        if (Math.abs(p1.row - p2.row) === 1 && p1.col1 === p2.col1 && p1.col2 === p2.col2) {
          return [p1.s1, p1.s2, p2.s1, p2.s2];
        }
      }
    }

    // 2. Numeric 2x2 fallback: difference of 1 in row, difference of 4 between rows
    const numMap = new Map();
    availableSeats.forEach((s) => {
      const n = parseSeatNumber(s.name);
      if (n > 0) numMap.set(n, s);
    });

    if (numMap.size >= 4) {
      for (const s of availableSeats) {
        const n = parseSeatNumber(s.name);
        if (n <= 0) continue;

        // Pattern 1: n & n+1 (pair), plus n+4 & n+5 (pair) e.g. 8,9 & 12,13 in UMA coach!
        if (numMap.has(n + 1) && numMap.has(n + 4) && numMap.has(n + 5)) {
          return [s, numMap.get(n + 1), numMap.get(n + 4), numMap.get(n + 5)];
        }
        // Pattern 2: n & n-1 (pair), plus n+4 & n+3 (pair)
        if (numMap.has(n - 1) && numMap.has(n + 4) && numMap.has(n + 3)) {
          return [s, numMap.get(n - 1), numMap.get(n + 4), numMap.get(n + 3)];
        }
        // Pattern 3: Standard getPashapashiPartnerNum
        const partner = getPashapashiPartnerNum(n);
        if (partner && numMap.has(partner)) {
          const p2 = n + 4;
          const p2Partner = getPashapashiPartnerNum(p2);
          if (numMap.has(p2) && numMap.has(p2Partner)) {
            return [s, numMap.get(partner), numMap.get(p2), numMap.get(p2Partner)];
          }
        }
      }
    }

    return null;
  }

  function evaluateCoachSeats(allSeats, paxCount) {
    const available = allSeats.filter((s) => s.isAvailable);
    if (available.length < paxCount) {
      return {
        quality: 0,
        chosenSeats: available,
        reason: `${available.length} of ${paxCount} seats available`
      };
    }

    // 1 SEAT: Window preferred ONLY when paxCount is strictly 1
    if (paxCount === 1) {
      for (const s of available) {
        const n = parseSeatNumber(s.name);
        if (isBDWindowSeatNum(n)) {
          return { quality: 3, chosenSeats: [s], reason: "Window seat" };
        }
      }
      const win = available.find((s) => s.isWindow);
      if (win) return { quality: 3, chosenSeats: [win], reason: "Window seat" };
      return { quality: 2, chosenSeats: [available[0]], reason: "Aisle seat" };
    }

    // =========================================================================
    // MULTIPLE SEATS (2, 3, 4): WINDOW SEARCHING IS STRICTLY DISABLED!
    // 1st Priority: "পাশাপাশি" (side-by-side in row) or "সামনে পেছনে" (front-to-back in column)!
    // =========================================================================

    // 2 SEATS:
    if (paxCount === 2) {
      // 1st Priority: পাশাপাশি জোড়া (Physical side-by-side pair in same row)
      const pashapashi = findPashapashiPair(available);
      if (pashapashi) {
        return {
          quality: 3,
          chosenSeats: pashapashi,
          reason: "পাশাপাশি জোড়া (Side-by-side pair in same row)"
        };
      }

      // 2nd Priority: সামনে পেছনে (Same column front-to-back)
      const frontBack = findFrontBackPair(available);
      if (frontBack) {
        return {
          quality: 3,
          chosenSeats: frontBack,
          reason: "সামনে পেছনে (Same column front-to-back)"
        };
      }

      return { quality: 1, chosenSeats: available.slice(0, 2), reason: "আলাদা সিট" };
    }

    // 3 SEATS:
    if (paxCount === 3) {
      // 1st Priority: সামনে পেছনে (3 in same column front-to-back)
      const col3 = findColumnSeats(available, 3);
      if (col3) {
        return {
          quality: 3,
          chosenSeats: col3,
          reason: "সামনে পেছনে কলামে পরপর ৩টি সিট (3 consecutive in column)"
        };
      }

      // 2nd Priority: পাশাপাশি জোড়া + সামনে/পেছনে ১টি
      const physicalPairs = getPhysicalPairs(available);
      if (physicalPairs.length > 0) {
        const p = physicalPairs[0];
        const adjacent = available.find(
          (s) => (s.col === p.col1 || s.col === p.col2) && Math.abs(s.row - p.row) === 1
        );
        if (adjacent) {
          return {
            quality: 3,
            chosenSeats: [p.s1, p.s2, adjacent],
            reason: "পাশাপাশি জোড়া + সামনে/পেছনে ১টি (Pair + column adjacent)"
          };
        }
        const remaining = available.filter((s) => s !== p.s1 && s !== p.s2);
        if (remaining.length > 0) {
          return {
            quality: 2,
            chosenSeats: [p.s1, p.s2, remaining[0]],
            reason: "পাশাপাশি জোড়া + ১টি সিট"
          };
        }
      }

      return { quality: 1, chosenSeats: available.slice(0, 3), reason: "আলাদা সিট" };
    }

    // 4 SEATS:
    if (paxCount === 4) {
      // 1st Priority: একসাথে ৪টি সিট (2x2 compact block: ২টি পাশাপাশি ও ঠিক সামনে/পেছনে ২টি পাশাপাশি)
      const block2x2 = find2x2Block(available);
      if (block2x2) {
        return {
          quality: 3,
          chosenSeats: block2x2,
          reason: "৪টি সিট একসাথে (2x2 ফ্যামিলি ব্লক)"
        };
      }

      // 2nd Priority: সামনে পেছনে (4 in same column front-to-back)
      const col4 = findColumnSeats(available, 4);
      if (col4) {
        return {
          quality: 3,
          chosenSeats: col4,
          reason: "সামনে পেছনে কলামে পরপর ৪টি সিট (4 consecutive in column)"
        };
      }

      // 3rd Priority: ২টি পাশাপাশি জোড়া
      const physicalPairs = getPhysicalPairs(available);
      if (physicalPairs.length >= 2) {
        const p1 = physicalPairs[0];
        const p2 = physicalPairs.find((p) => p !== p1 && p.row !== p1.row);
        if (p2) {
          return {
            quality: 2,
            chosenSeats: [p1.s1, p1.s2, p2.s1, p2.s2],
            reason: "২টি পাশাপাশি জোড়া (একই বগিতে)"
          };
        }
      }

      return { quality: 1, chosenSeats: available.slice(0, 4), reason: "আলাদা সিট" };
    }

    return { quality: 1, chosenSeats: available.slice(0, paxCount), reason: "Default" };
  }

  function parseSeatNumber(name) {
    if (!name) return 0;
    const m = name.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function getPashapashiPartnerNum(num) {
    if (num <= 0) return null;
    const rem = num % 4;
    if (rem === 0) return num - 1; // e.g. 32 -> 31
    if (rem === 3) return num + 1; // e.g. 31 -> 32
    if (rem === 2) return num - 1; // e.g. 34 -> 33
    if (rem === 1) return num + 1; // e.g. 33 -> 34
    return null;
  }

  function isBDWindowSeatNum(num) {
    if (num <= 0) return false;
    // In BD Railway 4-across layout: Far left = 4N (window), Far right = 4N-3 (window: 1, 5, 9, 13...)
    return num % 4 === 0 || num % 4 === 1;
  }

  function findBestSeats(allSeats, maxRow, maxCol, count) {
    const available = allSeats.filter((s) => s.isAvailable);
    if (available.length < count) {
      return available;
    }

    const evalResult = evaluateCoachSeats(allSeats, count);
    return (evalResult && evalResult.chosenSeats) || available.slice(0, count);
  }

  function getSelectedSeatsFromSummary() {
    const candidateSummary = document.querySelector(".seat-details, .trip-fare, .seat-fare-summary, .ticket-details, .fare-details") ||
      Array.from(document.querySelectorAll("div, table, section, app-trip-seat")).find((el) => {
        const txt = (el.innerText || el.textContent || "").toLowerCase();
        return txt.includes("seat details") || txt.includes("seat fare") || txt.includes("total:");
      });

    if (!candidateSummary) return [];

    const text = candidateSummary.innerText || candidateSummary.textContent || "";
    const matches = text.match(/[A-Za-z0-9\u0980-\u09FF]{1,8}\s*-\s*[0-9\u09E6-\u09EF]{1,3}/g) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, "").toUpperCase())));
  }

  function getRequestedPaxCount() {
    const adult = parseInt(config.adultCount, 10);
    const child = parseInt(config.childCount, 10);
    const total = (isNaN(adult) ? 1 : adult) + (isNaN(child) ? 0 : child);
    return Math.min(4, Math.max(1, total));
  }

  async function executeSeatClicks(chosenSeats) {
    hasAutoSelectedSeatsOnCurrentView = true;
    const selectedNames = [];

    // 1. Deselect any currently selected seats on the visible map that are NOT in chosenSeats
    const mapSeats = findSeatElementsOnPage();
    for (const el of mapSeats) {
      const cls = String(el.className || "").toLowerCase();
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor || "";
      const isSelected = cls.includes("selected") || cls.includes("seat-selected") || (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.test(bg) && parseInt(RegExp.$3, 10) > 100 && parseInt(RegExp.$1, 10) < 80);
      if (isSelected) {
        const name = extractSeatNameFromElement(el);
        if (!chosenSeats.some((s) => s.name === name)) {
          triggerElementClick(el);
          await sleep(140);
        }
      }
    }

    // 2. Click the chosen seats
    for (const seat of chosenSeats) {
      seat.el.scrollIntoView({ behavior: "smooth", block: "center" });
      seat.el.classList.add("rqb-auto-selected-seat");
      triggerElementClick(seat.el);
      selectedNames.push(seat.name);
      await sleep(180);
    }

    const msg = getI18n("widgetSeatSelected", {
      count: chosenSeats.length,
      seats: selectedNames.join(", ")
    });
    updateWidgetStatus(msg);

    // Auto-fill co-passenger details if available
    setTimeout(() => {
      autofillPassengerDetails();
    }, 500);
  }

  async function autoSelectSeats(seatElements = null) {
    if (config.enabled === false) return;
    if (isSelectingSeats) return;
    isSelectingSeats = true;

    try {
      // Safety guard: Verify the open seat map matches the user's preferred seatClass
      const openClass = getCurrentOpenSeatClass();
      if (openClass && openClass !== config.seatClass) {
        console.log(`[Railway QuickBook] Open seat map belongs to '${openClass}', but preferred is '${config.seatClass}'. Switching...`);
        const prefCard = document.querySelector(".rqb-preferred-train-card") || document.querySelector("app-single-trip, .single-trip-wrapper");
        if (prefCard) {
          tryAutoBookPreferredClass(prefCard);
        }
        return;
      }

      const paxCount = getRequestedPaxCount();
      const coachSelector = findCoachSelector();
      const coaches = getCoachList(coachSelector);
      const currentCoach = coaches.find((c) => c.isSelected) || coaches[0];
      const currentCoachName = currentCoach ? currentCoach.name : "Current";

      if (currentCoach) visitedCoaches.add(currentCoach.name);

      // Safety guard: Detect if seats from ANOTHER coach are already held in cart
      const summarySeats = getSelectedSeatsFromSummary();
      const foreignSeats = summarySeats.filter((seatName) => !seatName.startsWith(currentCoachName + "-"));
      if (foreignSeats.length > 0) {
        const otherCoach = foreignSeats[0].split("-")[0];
        console.warn(`[Railway QuickBook] Foreign coach seats detected in cart:`, foreignSeats);
        updateWidgetStatus(
          config.lang === "bn"
            ? `⚠️ পূর্বে '${otherCoach}' বগির সিট সিলেক্ট রয়েছে। একই টিকিটে দুই বগির সিট হয় না। দয়া করে পূর্বের সিট আনচেক করুন বা পেজ রিফ্রেশ দিন।`
            : `⚠️ Seats from coach '${otherCoach}' already held in cart. Cannot book across multiple coaches.`
        );
      }

      // STEP 1: Fast-check dropdown availability!
      // If current coach explicitly shows fewer available seats than paxCount in its option text:
      // (e.g. "KA - 1 Seat(s)" when paxCount is 2)
      if (currentCoach && currentCoach.availableSeats >= 0 && currentCoach.availableSeats < paxCount) {
        const candidateCoaches = coaches.filter(
          (c) => !visitedCoaches.has(c.name) && (c.availableSeats >= paxCount || c.availableSeats === -1)
        );

        if (candidateCoaches.length > 0) {
          const targetCoach = candidateCoaches[0];
          const switchMsg = config.lang === "bn"
            ? `🔄 '${currentCoachName}'-তে মাত্র ${currentCoach.availableSeats}টি সিট আছে। ${paxCount}টি সিটের জন্য '${targetCoach.name}' কোচে যাওয়া হচ্ছে...`
            : `🔄 Coach '${currentCoachName}' has only ${currentCoach.availableSeats} seat(s). Switching to '${targetCoach.name}' for ${paxCount} seats...`;
          updateWidgetStatus(switchMsg);
          hasAutoSelectedSeatsOnCurrentView = false;
          switchToCoach(coachSelector, targetCoach);
          setTimeout(() => waitForSeatLayoutAndAutoSelect(8000), 700);
          return;
        }
      }

      // STEP 2: Evaluate the current coach's visible seats
      const elements = seatElements || findSeatElementsOnPage();
      if (elements.length === 0) {
        updateWidgetStatus(getI18n("widgetNoSeats"));
        return;
      }

      const { seats, maxRow } = analyzeSeatLayout(elements);
      const evalResult = evaluateCoachSeats(seats, paxCount, maxRow);

      // PERFECT MATCH (Quality 3: e.g. 2x2 compact block together for 4 pax, Pashapashi pair for 2 pax, Window for 1 pax)
      if (evalResult.quality === 3) {
        await executeSeatClicks(evalResult.chosenSeats);
        return;
      }

      // MATCH IS NOT PERFECT:
      // Check remaining unvisited coaches that could have enough seats
      const unvisitedCoaches = coaches.filter(
        (c) => !visitedCoaches.has(c.name) && (c.availableSeats >= paxCount || c.availableSeats === -1)
      );

      // If current coach has INSUFFICIENT seats (Quality 0, e.g. only 1 seat on map for 2 pax):
      if (evalResult.quality === 0) {
        if (unvisitedCoaches.length > 0) {
          const nextCoach = unvisitedCoaches[0];
          const switchMsg = config.lang === "bn"
            ? `🔄 '${currentCoachName}'-তে পর্যাপ্ত সিট নেই (${evalResult.chosenSeats.length}/${paxCount})। '${nextCoach.name}' কোচে খোঁজা হচ্ছে...`
            : `🔄 Insufficient seats in '${currentCoachName}'. Checking coach '${nextCoach.name}'...`;
          updateWidgetStatus(switchMsg);
          hasAutoSelectedSeatsOnCurrentView = false;
          switchToCoach(coachSelector, nextCoach);
          setTimeout(() => waitForSeatLayoutAndAutoSelect(8000), 700);
          return;
        } else {
          // All coaches checked, none has enough seats
          hasAutoSelectedSeatsOnCurrentView = true;
          updateWidgetStatus(
            config.lang === "bn"
              ? `⚠️ কোনো কোচে একসাথে ${paxCount} টি খালি সিট পাওয়া যায়নি।`
              : `⚠️ Could not find ${paxCount} available seats in any coach.`
          );
          return;
        }
      }

      // If current coach has enough seats (Quality 1 or 2, e.g. 4 seats but not 2x2 compact block):
      // Save this as a candidate fallback:
      if (!bestFallbackCoachSeats || evalResult.quality > bestFallbackCoachSeats.quality) {
        bestFallbackCoachSeats = {
          coach: currentCoach,
          seats: evalResult.chosenSeats,
          quality: evalResult.quality,
          selector: coachSelector
        };
      }

      // If other coaches exist with >= paxCount seats, check them for an IDEAL (2x2 compact block for 4, or pashapashi pair for 2)!
      if (unvisitedCoaches.length > 0 && paxCount > 1) {
        const nextCoach = unvisitedCoaches[0];
        const switchMsg = config.lang === "bn"
          ? (paxCount === 4
              ? `🔄 '${currentCoachName}'-তে ৪টি সিট একসাথে মেলেনি। '${nextCoach.name}' কোচে একসাথে ৪ সিট খোঁজা হচ্ছে...`
              : `🔄 '${currentCoachName}'-তে পাশাপাশি মেলেনি। '${nextCoach.name}' কোচে পাশাপাশি জোড়া খোঁজা হচ্ছে...`)
          : (paxCount === 4
              ? `🔄 No 4-seat block in '${currentCoachName}'. Checking '${nextCoach.name}'...`
              : `🔄 No adjacent pair in '${currentCoachName}'. Checking '${nextCoach.name}' for side-by-side...`);
        updateWidgetStatus(switchMsg);
        hasAutoSelectedSeatsOnCurrentView = false;
        switchToCoach(coachSelector, nextCoach);
        setTimeout(() => waitForSeatLayoutAndAutoSelect(8000), 700);
        return;
      }

      // All coaches explored, use best fallback found
      const seatsToSelect = (bestFallbackCoachSeats && bestFallbackCoachSeats.seats) || evalResult.chosenSeats;
      await executeSeatClicks(seatsToSelect);
    } finally {
      setTimeout(() => {
        isSelectingSeats = false;
      }, 800);
    }
  }

  // =========================================================================
  // 4. Co-Passenger Details Autofill (Checkout / Passenger Info Page)
  // =========================================================================

  function autofillPassengerDetails() {
    const coPassengers = (config.coPassengers || []).filter((p) => p && p.name && p.name.trim());
    if (coPassengers.length === 0) return 0;

    const nameInputs = Array.from(
      document.querySelectorAll(
        "input[formcontrolname*='passenger' i], input[name*='passenger' i], input[id*='passenger' i], input[placeholder*='Passenger Name' i], input[placeholder*='Full Name' i]"
      )
    ).filter((el) => el.type === "text" && !el.readOnly && !el.disabled);

    if (nameInputs.length === 0) return 0;

    let filledCount = 0;
    const targetInputs = nameInputs.filter((inp, idx) => idx > 0 || !inp.value.trim());

    for (let i = 0; i < Math.min(coPassengers.length, targetInputs.length); i++) {
      const pax = coPassengers[i];
      const inputEl = targetInputs[i];
      if (pax.name && inputEl) {
        setNativeValue(inputEl, pax.name.trim());
        inputEl.dispatchEvent(new Event("blur", { bubbles: true }));
        filledCount++;
      }
    }

    return filledCount;
  }

  // =========================================================================
  // 5. On-Page Floating QuickBook Assistant Widget
  // =========================================================================

  function createOrUpdateFloatingWidget() {
    let widget = document.getElementById("rqb-floating-widget");

    if (config.options && config.options.showFloatingWidget === false) {
      if (widget) widget.style.display = "none";
      return;
    }

    const isBn = config.lang === "bn";
    const headerTitle = isBn ? "ক্লিক করে ছোট/বড় করুন" : "Click to expand/minimize";
    const switchTitle = isBn ? "QuickBook অন/অফ করুন" : "QuickBook On/Off";
    const minimizeTitle = isBn ? "মিনিমাইজ" : "Minimize";

    if (!widget) {
      widget = document.createElement("div");
      widget.id = "rqb-floating-widget";
      widget.innerHTML = `
        <div class="rqb-widget-header" id="rqbWidgetHeader" title="${headerTitle}">
          <div class="rqb-header-left">
            <span>🚆 QuickBook</span>
            <span class="rqb-live-clock" id="rqbLiveClock">--:--:--</span>
          </div>
          <div class="rqb-header-actions" onclick="event.stopPropagation();">
            <label class="rqb-widget-switch" title="${switchTitle}">
              <input type="checkbox" id="rqbWidgetToggle" ${config.enabled !== false ? "checked" : ""} />
              <span class="rqb-slider"></span>
            </label>
            <button type="button" class="rqb-toggle-btn" id="rqbMinimizeBtn" title="${minimizeTitle}">_</button>
          </div>
        </div>
        <div class="rqb-widget-body">
          <div class="rqb-route-summary">
            <div class="rqb-route-line">
              <span id="rqbRouteText">Dhaka ➔ Chattogram</span>
            </div>
            <div class="rqb-meta-line">
              <span id="rqbDateText">--</span> •
              <span id="rqbClassText">S_CHAIR</span> •
              <span id="rqbTrainsCount">3 trains</span>
            </div>
            <div class="rqb-pax-selector-row">
              <span class="rqb-pax-label">💺 ${isBn ? "সিট সংখ্যা:" : "Seats:"}</span>
              <div class="rqb-pax-chips" id="rqbPaxChips">
                <button type="button" class="rqb-pax-chip ${getRequestedPaxCount() === 1 ? 'active' : ''}" data-pax="1">1 ${isBn ? 'সিট' : 'Seat'}</button>
                <button type="button" class="rqb-pax-chip ${getRequestedPaxCount() === 2 ? 'active' : ''}" data-pax="2">2 ${isBn ? 'সিট' : 'Seats'}</button>
                <button type="button" class="rqb-pax-chip ${getRequestedPaxCount() === 3 ? 'active' : ''}" data-pax="3">3 ${isBn ? 'সিট' : 'Seats'}</button>
                <button type="button" class="rqb-pax-chip ${getRequestedPaxCount() === 4 ? 'active' : ''}" data-pax="4">4 ${isBn ? 'সিট' : 'Seats'}</button>
              </div>
            </div>
          </div>
          <div class="rqb-btn-grid">
            <button type="button" class="rqb-action-btn" id="rqbBtnFillOnly">
              ${getI18n("widgetFillOnly")}
            </button>
            <button type="button" class="rqb-action-btn rqb-btn-primary" id="rqbBtnFillSearch">
              ${getI18n("widgetFillSearch")}
            </button>
            <button type="button" class="rqb-action-btn" id="rqbBtnHighlight">
              ${getI18n("widgetHighlight")}
            </button>
            <button type="button" class="rqb-action-btn" id="rqbBtnAutoSeat">
              ${getI18n("widgetAutoSeat")}
            </button>
            <button type="button" class="rqb-action-btn" id="rqbBtnFillPax">
              ${getI18n("widgetFillPax")}
            </button>
          </div>
          <div class="rqb-status-bar" id="rqbStatusBar">
            ${getI18n("widgetReady")}
          </div>
        </div>
      `;
      document.body.appendChild(widget);

      // Events
      document.getElementById("rqbWidgetHeader").addEventListener("click", () => {
        widget.classList.toggle("rqb-minimized");
      });

      const toggleInput = document.getElementById("rqbWidgetToggle");
      if (toggleInput) {
        toggleInput.addEventListener("change", () => {
          config.enabled = toggleInput.checked;
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ quickbookConfig: config });
          }
          if (config.enabled) {
            highlightPreferredTrains();
            updateWidgetStatus(getI18n("widgetActive"));
          } else {
            highlightPreferredTrains();
            updateWidgetStatus(getI18n("widgetPaused"));
          }
        });
      }

      document.getElementById("rqbBtnFillOnly").addEventListener("click", () => {
        autofillSearchForm(false);
      });

      document.getElementById("rqbBtnFillSearch").addEventListener("click", () => {
        autofillSearchForm(true);
      });

      document.getElementById("rqbBtnHighlight").addEventListener("click", () => {
        hasScrolledCurrentSearch = false;
        const count = highlightPreferredTrains();
        if (count === 0) {
          updateWidgetStatus(config.lang === "bn" ? "ℹ️ এই পেজে এখনো পছন্দের ট্রেন পাওয়া যায়নি।" : "ℹ️ No preferred trains found on this page yet.");
        }
      });

      document.getElementById("rqbBtnAutoSeat").addEventListener("click", () => {
        visitedCoaches.clear();
        bestFallbackCoachSeats = null;
        hasAutoSelectedSeatsOnCurrentView = false;
        autoSelectSeats();
      });

      document.getElementById("rqbBtnFillPax").addEventListener("click", () => {
        const count = autofillPassengerDetails();
        if (count > 0) {
          updateWidgetStatus(getI18n("widgetPaxFilled", { count }));
        } else {
          updateWidgetStatus(config.lang === "bn" ? "ℹ️ যাত্রী তথ্যের ফর্ম পাওয়া যায়নি বা নাম সেভ নেই।" : "ℹ️ Co-passenger form not found or no names saved.");
        }
      });

      // Quick Seat / Passenger count selector chips in floating widget
      widget.querySelectorAll(".rqb-pax-chip").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          const targetPax = parseInt(chip.dataset.pax, 10) || 1;
          config.adultCount = targetPax;
          config.childCount = 0;
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ quickbookConfig: config });
          }
          createOrUpdateFloatingWidget();
          const ruleName = targetPax === 1
            ? (config.lang === "bn" ? "জানালা সিট অগ্রাধিকার" : "Window preferred")
            : targetPax === 2
              ? (config.lang === "bn" ? "পাশাপাশি জোড়া অগ্রাধিকার" : "Side-by-side pair preferred")
              : targetPax === 3
                ? (config.lang === "bn" ? "একই কলামে পরপর ৩ সিট" : "3 in column preferred")
                : (config.lang === "bn" ? "৪টি সিট একসাথে অগ্রাধিকার (উইন্ডোর চেয়ে একসাথে প্রাধান্য)" : "4 together preferred instead of window");
          updateWidgetStatus(
            config.lang === "bn"
              ? `🎯 সিট সংখ্যা ${targetPax} টি নির্ধারণ করা হয়েছে (${ruleName})`
              : `🎯 Target seats set to ${targetPax} (${ruleName})`
          );
        });
      });

      startWidgetClock();
    } else {
      widget.style.display = "block";
    }

    // Refresh summary, pax chips & button text with current language
    const currentPax = getRequestedPaxCount();
    const paxChips = widget.querySelectorAll(".rqb-pax-chip");
    paxChips.forEach((chip) => {
      const p = parseInt(chip.dataset.pax, 10);
      chip.classList.toggle("active", p === currentPax);
      chip.textContent = `${p} ${isBn ? (p === 1 ? "সিট" : "সিট") : (p === 1 ? "Seat" : "Seats")}`;
    });

    const paxLabel = widget.querySelector(".rqb-pax-label");
    if (paxLabel) paxLabel.innerHTML = `💺 ${isBn ? "সিট সংখ্যা:" : "Seats:"}`;
    const rText = document.getElementById("rqbRouteText");
    const dText = document.getElementById("rqbDateText");
    const cText = document.getElementById("rqbClassText");
    const tCount = document.getElementById("rqbTrainsCount");
    const wToggle = document.getElementById("rqbWidgetToggle");

    const btnFillOnly = document.getElementById("rqbBtnFillOnly");
    const btnFillSearch = document.getElementById("rqbBtnFillSearch");
    const btnHighlight = document.getElementById("rqbBtnHighlight");
    const btnAutoSeat = document.getElementById("rqbBtnAutoSeat");
    const btnFillPax = document.getElementById("rqbBtnFillPax");

    if (btnFillOnly) btnFillOnly.innerHTML = getI18n("widgetFillOnly");
    if (btnFillSearch) btnFillSearch.innerHTML = getI18n("widgetFillSearch");
    if (btnHighlight) btnHighlight.innerHTML = getI18n("widgetHighlight");
    if (btnAutoSeat) btnAutoSeat.innerHTML = getI18n("widgetAutoSeat");
    if (btnFillPax) btnFillPax.innerHTML = getI18n("widgetFillPax");

    if (wToggle) wToggle.checked = config.enabled !== false;
    if (rText) rText.textContent = `${config.fromStation} ➔ ${config.toStation}`;
    if (dText) dText.textContent = formatToRailwayDate(config.journeyDate);
    if (cText) cText.textContent = config.seatClass;
    if (tCount) {
      const trainUnit = isBn ? "টি ট্রেন" : "trains";
      tCount.textContent = `⭐ ${(config.preferredTrains || []).length} ${trainUnit}`;
    }
  }

  function updateWidgetStatus(msg) {
    const statusEl = document.getElementById("rqbStatusBar");
    if (statusEl) statusEl.textContent = msg;
  }

  function startWidgetClock() {
    const updateClock = () => {
      const clockEl = document.getElementById("rqbLiveClock");
      if (!clockEl) return;
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const bst = new Date(utcMs + 6 * 3600000);
      const h = bst.getHours();
      const m = String(bst.getMinutes()).padStart(2, "0");
      const s = String(bst.getSeconds()).padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = String(h % 12 || 12).padStart(2, "0");
      clockEl.textContent = `${h12}:${m}:${s} ${ampm}`;
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  // =========================================================================
  // 6. Storage Sync, Message Listeners & DOM Observer
  // =========================================================================

  function initStorageAndListeners() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["quickbookConfig", "pendingAutoFillOnLoad"], (res) => {
        if (res.quickbookConfig) {
          config = { ...config, ...res.quickbookConfig };
        }
        createOrUpdateFloatingWidget();
        highlightPreferredTrains();

        // Check if page already has seat layout open on load
        setTimeout(() => {
          if (config.enabled === false) return;
          const initialSeats = findSeatElementsOnPage();
          if (initialSeats.length > 0 && !hasAutoSelectedSeatsOnCurrentView) {
            autoSelectSeats(initialSeats);
          }
        }, 700);

        if (res.pendingAutoFillOnLoad) {
          chrome.storage.local.remove("pendingAutoFillOnLoad");
          if (config.enabled === false) return;
          setTimeout(() => autofillSearchForm(true), 600);
        }
      });

      // Live update when config changes in Popup
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.quickbookConfig && changes.quickbookConfig.newValue) {
          config = { ...config, ...changes.quickbookConfig.newValue };
          createOrUpdateFloatingWidget();
          if (config.enabled === false) {
            document.querySelectorAll(".rqb-preferred-train-card, .rqb-dimmed-train-card").forEach((el) => {
              el.classList.remove("rqb-preferred-train-card", "rqb-dimmed-train-card");
            });
            document.querySelectorAll(".rqb-preferred-badge").forEach((el) => el.remove());
            document.querySelectorAll(".rqb-preferred-seat-class").forEach((sc) => sc.classList.remove("rqb-preferred-seat-class"));
            updateWidgetStatus(config.lang === "bn" ? "⏸️ QuickBook বন্ধ (OFF)" : "⏸️ QuickBook Paused (OFF)");
          } else {
            highlightPreferredTrains();
          }
        }
      });

      // Listen for Popup or Keyboard Shortcut commands
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.action === "TRIGGER_AUTOFILL") {
          if (message.config) config = { ...config, ...message.config };
          createOrUpdateFloatingWidget();
          if (config.enabled === false) {
            updateWidgetStatus(config.lang === "bn" ? "⏸️ QuickBook বন্ধ (OFF) আছে।" : "⏸️ QuickBook is OFF.");
            sendResponse({ status: "disabled" });
            return true;
          }
          autofillSearchForm();
          sendResponse({ status: "ok" });
        } else if (message.action === "CONFIG_UPDATED") {
          if (message.config) config = { ...config, ...message.config };
          createOrUpdateFloatingWidget();
          if (config.enabled === false) {
            document.querySelectorAll(".rqb-preferred-train-card, .rqb-dimmed-train-card").forEach((el) => {
              el.classList.remove("rqb-preferred-train-card", "rqb-dimmed-train-card");
            });
            document.querySelectorAll(".rqb-preferred-badge").forEach((el) => el.remove());
            document.querySelectorAll(".rqb-preferred-seat-class").forEach((sc) => sc.classList.remove("rqb-preferred-seat-class"));
            updateWidgetStatus(config.lang === "bn" ? "⏸️ QuickBook বন্ধ (OFF)" : "⏸️ QuickBook Paused (OFF)");
          } else {
            highlightPreferredTrains();
          }
          sendResponse({ status: "ok" });
        }
        return true;
      });
    } else {
      createOrUpdateFloatingWidget();
    }

    // In-page keyboard shortcuts:
    // Alt + Shift + F: Quick Autofill search form
    // Alt + Shift + S: Quick Auto-select seats
    window.addEventListener("keydown", (e) => {
      if (e.altKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        if (config.enabled === false) return;
        autofillSearchForm();
      } else if (e.altKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        if (config.enabled === false) return;
        autoSelectSeats();
      }
    });

    // Listen for manual "Book Now" / "বুক করুন" clicks to trigger smart seat selection
    document.addEventListener("click", (e) => {
      if (config.enabled === false) return; // Master Switch OFF: completely ignore clicks
      const btn = e.target.closest && e.target.closest("button, a, [role='button'], .book-now-btn, div");
      const txt = (btn && (btn.innerText || btn.textContent) || "").trim();
      if (/book\s*now|বুক\s*করুন/i.test(txt)) {
        hasAutoSelectedSeatsOnCurrentView = false;
        waitForSeatLayoutAndAutoSelect(10000, true);
      }

      // Listen for coach / bogie tab or dropdown clicks to trigger auto-select for the newly opened coach
      const coachBtn = e.target.closest && e.target.closest("button, a, [role='tab'], .coach-tab, .bogie-tab, [class*='coach'], [class*='bogie'], ng-select, select");
      if (coachBtn && !coachBtn.closest("#rqb-floating-widget")) {
        hasAutoSelectedSeatsOnCurrentView = false;
        setTimeout(() => {
          if (config.enabled === false) return;
          waitForSeatLayoutAndAutoSelect(6000);
        }, 500);
      }
    });

    // Observe Angular SPA DOM changes (train search results loading, route changes, seat maps)
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      if (config.enabled === false) return; // Master Switch OFF: completely stop observer
      if (isApplyingHighlight) return;

      const urlChanged = location.href !== lastUrl;
      if (urlChanged) {
        lastUrl = location.href;
        hasScrolledCurrentSearch = false;
        hasAutoBookedCurrentSearch = false;
        hasAutoSelectedSeatsOnCurrentView = false;
      }

      // 1. Check if seat layout is visible and seats can be auto-selected
      // CRITICAL GUARD: Only check seats if a seat layout container is actually present in the DOM!
      if (!hasAutoSelectedSeatsOnCurrentView && !isSelectingSeats) {
        const seatBox = getSeatContainer();
        if (seatBox) {
          const foundSeats = findSeatElementsOnPage();
          if (foundSeats.length > 0) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              autoSelectSeats(foundSeats);
            }, 300);
            return;
          }
        }
      }

      // 2. Check if actual train cards were added to the DOM
      let hasTrainCardChanges = false;
      for (const m of mutations) {
        // Skip mutations originating inside extension elements or highlighted cards
        const t = m.target;
        const targetEl = t && t.nodeType === 1 ? t : t ? t.parentElement : null;
        if (
          targetEl &&
          targetEl.closest &&
          targetEl.closest("#rqb-floating-widget, .rqb-preferred-badge, .rqb-preferred-seat-class, .rqb-preferred-train-card")
        ) {
          continue;
        }

        if (m.addedNodes && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              const tag = (node.tagName || "").toLowerCase();
              const cls = typeof node.className === "string" ? node.className.toLowerCase() : "";
              if (
                tag.includes("trip") ||
                tag.includes("train") ||
                cls.includes("trip") ||
                cls.includes("train") ||
                node.querySelector?.("app-single-trip, .single-trip-wrapper, .trip-card, [class*='trip'], [class*='train']")
              ) {
                hasTrainCardChanges = true;
                break;
              }
            }
          }
        }
        if (hasTrainCardChanges) break;
      }

      if (!urlChanged && !hasTrainCardChanges) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        highlightPreferredTrains();
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStorageAndListeners);
  } else {
    initStorageAndListeners();
  }
})();
