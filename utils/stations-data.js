/**
 * Railway QuickBook – Bangladesh Railway Stations, Seat Classes & Popular Trains Database
 * Works in both Popup (ES/Window) and Content Script contexts.
 */

const RAILWAY_DATA = {
  // বাংলাদেশ রেলওয়ের ই-টিকিট পোর্টালে ব্যবহৃত স্টেশনের সঠিক নামের তালিকা
  stations: [
    "Dhaka",
    "Biman_Bandar",
    "Chattogram",
    "Cox's Bazar",
    "Sylhet",
    "Rajshahi",
    "Khulna",
    "Rangpur",
    "Dinajpur",
    "Panchagarh",
    "Mymensingh",
    "Cumilla",
    "Brahmanbaria",
    "Feni",
    "Noakhali",
    "Sreemangal",
    "Bhairab_Bazar",
    "Kishoreganj",
    "Jamalpur_Town",
    "Tangail",
    "Ishwardi",
    "Ishwardi_Bypass",
    "Natore",
    "Santahar",
    "Bogura",
    "Parbatipur",
    "Saidpur",
    "Nilphamari",
    "Chilahati",
    "Thakurgaon_Road",
    "Kurigram",
    "Lalmonirhat",
    "Gaibandha",
    "Bonar_Para",
    "Jashore",
    "Benapole",
    "Kushtia_Court",
    "Poradaha",
    "Chuadanga",
    "Darshana_Halt",
    "Kotchandpur",
    "Ullapara",
    "Boral_Bridge",
    "Chatmohar",
    "Sirajganj_Bazar",
    "Ibrahimabad",
    "Joydebpur",
    "Narsingdi",
    "Akhaura",
    "Shaistaganj",
    "Kulaura",
    "Maijdee_Court",
    "Laksam",
    "Chandpur",
    "Gafargaon",
    "Sarishabari",
    "Tarakandi",
    "Dewanganj_Bazar",
    "Mohanganj",
    "Netrokona",
    "Bhanga",
    "Mawa",
    "Padma",
    "Shibchar",
    "Faridpur",
    "Rajbari",
    "Pangsha",
    "Khoksa",
    "Chapainawabganj",
    "Abdulpur",
    "Ahsanganj",
    "Joypurhat",
    "Birampur",
    "Fulbari",
    "Chirirbandar",
    "Kaunia",
    "Pirganj",
    "Setabganj",
    "Bheramara",
    "Alamdanga",
    "Mubarakganj",
    "Noapara",
    "Daulatpur"
  ],

  // সিট ক্লাসের তালিকা (eticket.railway.gov.bd ভ্যালু অনুযায়ী)
  seatClasses: [
    { code: "S_CHAIR", label: "S_CHAIR (শোভন চেয়ার)", popular: true },
    { code: "SNIGDHA", label: "SNIGDHA (স্নিগ্ধা - AC Chair)", popular: true },
    { code: "AC_S", label: "AC_S (এসি সিট / কেবিন)", popular: true },
    { code: "AC_B", label: "AC_B (এসি বার্থ - Sleeper)", popular: true },
    { code: "F_BERTH", label: "F_BERTH (প্রথম শ্রেণী বার্থ)", popular: false },
    { code: "F_SEAT", label: "F_SEAT (প্রথম শ্রেণী সিট)", popular: false },
    { code: "F_CHAIR", label: "F_CHAIR (প্রথম শ্রেণী চেয়ার)", popular: false },
    { code: "SHOVAN", label: "SHOVAN (শোভন)", popular: false },
    { code: "SHULOV", label: "SHULOV (সুলভ)", popular: false },
    { code: "AC_CHAIR", label: "AC_CHAIR (এসি চেয়ার)", popular: false }
  ],

  // জনপ্রিয় আন্তঃনগর ট্রেনের তালিকা (রুট ও রিলিজ জোন সহ)
  // EAST Zone = সকাল ৮:০০ টায় টিকিট ছাড়ে | WEST Zone = দুপুর ২:০০ টায় টিকিট ছাড়ে
  popularTrains: [
    // Dhaka <-> Chattogram / Cox's Bazar (East Zone - 8:00 AM)
    { name: "SUBORNO EXPRESS", numbers: ["701", "702"], route: "Dhaka-Chattogram", zone: "EAST" },
    { name: "SONAR BANGLA EXPRESS", numbers: ["787", "788"], route: "Dhaka-Chattogram", zone: "EAST" },
    { name: "COX'S BAZAR EXPRESS", numbers: ["813", "814"], route: "Dhaka-Cox's Bazar", zone: "EAST" },
    { name: "PARJOTAK EXPRESS", numbers: ["815", "816"], route: "Dhaka-Cox's Bazar", zone: "EAST" },
    { name: "TURNA", numbers: ["741", "742"], route: "Dhaka-Chattogram", zone: "EAST" },
    { name: "MAHANAGAR PROVATI", numbers: ["703", "704"], route: "Dhaka-Chattogram", zone: "EAST" },
    { name: "MAHANAGAR EXPRESS", numbers: ["721", "722"], route: "Dhaka-Chattogram", zone: "EAST" },
    { name: "CHATALA EXPRESS", numbers: ["801", "802"], route: "Dhaka-Chattogram", zone: "EAST" },

    // Dhaka <-> Sylhet (East Zone - 8:00 AM)
    { name: "PARABAT EXPRESS", numbers: ["709", "710"], route: "Dhaka-Sylhet", zone: "EAST" },
    { name: "JAYENTIKA EXPRESS", numbers: ["717", "718"], route: "Dhaka-Sylhet", zone: "EAST" },
    { name: "UPABAN EXPRESS", numbers: ["739", "740"], route: "Dhaka-Sylhet", zone: "EAST" },
    { name: "KALNI EXPRESS", numbers: ["773", "774"], route: "Dhaka-Sylhet", zone: "EAST" },

    // Dhaka <-> Noakhali / Kishoreganj / Mymensingh / Jamalpur / Mohanganj (East Zone - 8:00 AM)
    { name: "UPAKUL EXPRESS", numbers: ["711", "712"], route: "Dhaka-Noakhali", zone: "EAST" },
    { name: "TISTA EXPRESS", numbers: ["707", "708"], route: "Dhaka-Dewanganj_Bazar", zone: "EAST" },
    { name: "AGHNIBINA EXPRESS", numbers: ["735", "736"], route: "Dhaka-Tarakandi", zone: "EAST" },
    { name: "JAMUNA EXPRESS", numbers: ["745", "746"], route: "Dhaka-Tarakandi", zone: "EAST" },
    { name: "BRAHMAPUTRA EXPRESS", numbers: ["743", "744"], route: "Dhaka-Dewanganj_Bazar", zone: "EAST" },
    { name: "HAWR EXPRESS", numbers: ["777", "778"], route: "Dhaka-Mohanganj", zone: "EAST" },
    { name: "MOHANGANJ EXPRESS", numbers: ["789", "790"], route: "Dhaka-Mohanganj", zone: "EAST" },
    { name: "KISHOREGANJ EXPRESS", numbers: ["781", "782"], route: "Dhaka-Kishoreganj", zone: "EAST" },
    { name: "EGAROSINDHUR PROVATI", numbers: ["737", "738"], route: "Dhaka-Kishoreganj", zone: "EAST" },
    { name: "EGAROSINDHUR GODHULI", numbers: ["749", "750"], route: "Dhaka-Kishoreganj", zone: "EAST" },

    // Dhaka <-> Rajshahi / Chapainawabganj (West Zone - 2:00 PM)
    { name: "BANALATA EXPRESS", numbers: ["791", "792"], route: "Dhaka-Rajshahi", zone: "WEST" },
    { name: "SILKCITY EXPRESS", numbers: ["753", "754"], route: "Dhaka-Rajshahi", zone: "WEST" },
    { name: "PADMA EXPRESS", numbers: ["759", "760"], route: "Dhaka-Rajshahi", zone: "WEST" },
    { name: "DHUMKETU EXPRESS", numbers: ["769", "770"], route: "Dhaka-Rajshahi", zone: "WEST" },
    { name: "MADHUMATI EXPRESS", numbers: ["755", "756"], route: "Dhaka-Rajshahi", zone: "WEST" },

    // Dhaka <-> Khulna / Benapole / Jashore (West Zone - 2:00 PM)
    { name: "SUNDARBAN EXPRESS", numbers: ["725", "726"], route: "Dhaka-Khulna", zone: "WEST" },
    { name: "CHITRA EXPRESS", numbers: ["763", "764"], route: "Dhaka-Khulna", zone: "WEST" },
    { name: "JAHANABAD EXPRESS", numbers: ["825", "826"], route: "Dhaka-Khulna", zone: "WEST" },
    { name: "BENAPOLE EXPRESS", numbers: ["795", "796"], route: "Dhaka-Benapole", zone: "WEST" },
    { name: "RUPOSHI BANGLA EXPRESS", numbers: ["827", "828"], route: "Dhaka-Benapole", zone: "WEST" },

    // Dhaka <-> Rangpur / Dinajpur / Panchagarh / Kurigram / Nilphamari (West Zone - 2:00 PM)
    { name: "PANCHAGARH EXPRESS", numbers: ["793", "794"], route: "Dhaka-Panchagarh", zone: "WEST" },
    { name: "EKOTA EXPRESS", numbers: ["705", "706"], route: "Dhaka-Panchagarh", zone: "WEST" },
    { name: "DRUTAJAN EXPRESS", numbers: ["757", "758"], route: "Dhaka-Panchagarh", zone: "WEST" },
    { name: "RANGPUR EXPRESS", numbers: ["771", "772"], route: "Dhaka-Rangpur", zone: "WEST" },
    { name: "KURIGRAM EXPRESS", numbers: ["797", "798"], route: "Dhaka-Kurigram", zone: "WEST" },
    { name: "LALMONI EXPRESS", numbers: ["751", "752"], route: "Dhaka-Lalmonirhat", zone: "WEST" },
    { name: "NEEL SAGAR EXPRESS", numbers: ["765", "766"], route: "Dhaka-Chilahati", zone: "WEST" },
    { name: "CHILAHATI EXPRESS", numbers: ["805", "806"], route: "Dhaka-Chilahati", zone: "WEST" },
    { name: "SIRAJGANJ EXPRESS", numbers: ["775", "776"], route: "Dhaka-Sirajganj_Bazar", zone: "WEST" }
  ],

  // ডিফল্ট কনফিগারেশন
  defaultConfig: {
    lang: "en", // ডিফল্ট ভাষা: ইংরেজি ("en"), ইউজার চাইলে "bn" সিলেক্ট করতে পারবেন
    enabled: true, // মাস্টার সুইচ: এক্সটেনশন অন/অফ
    fromStation: "Dhaka",
    toStation: "Chattogram",
    journeyDate: "", // খালি থাকলে পপআপ লোড হওয়ার সময় ১০ম দিনের তারিখ বসিয়ে দেবে
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
      autoExpandPreferredClass: true,
      dimNonPreferredTrains: false,
      showFloatingWidget: true,
      enableReleaseAlarm: false
    },
    savedPresets: [
      {
        id: "preset-ctg",
        title: "ঢাকা ➔ চট্টগ্রাম (সুবর্ণ/সোনার বাংলা)",
        fromStation: "Dhaka",
        toStation: "Chattogram",
        seatClass: "S_CHAIR",
        preferredTrains: ["SUBORNO EXPRESS", "SONAR BANGLA EXPRESS", "MAHANAGAR PROVATI"]
      },
      {
        id: "preset-cox",
        title: "ঢাকা ➔ কক্সবাজার (কক্সবাজার/পর্যটক)",
        fromStation: "Dhaka",
        toStation: "Cox's Bazar",
        seatClass: "S_CHAIR",
        preferredTrains: ["COX'S BAZAR EXPRESS", "PARJOTAK EXPRESS"]
      },
      {
        id: "preset-raj",
        title: "ঢাকা ➔ রাজশাহী (বনলতা/পদ্মা)",
        fromStation: "Dhaka",
        toStation: "Rajshahi",
        seatClass: "S_CHAIR",
        preferredTrains: ["BANALATA EXPRESS", "PADMA EXPRESS", "SILKCITY EXPRESS"]
      },
      {
        id: "preset-syl",
        title: "ঢাকা ➔ সিলেট (পারাবত/কালনী)",
        fromStation: "Dhaka",
        toStation: "Sylhet",
        seatClass: "S_CHAIR",
        preferredTrains: ["PARABAT EXPRESS", "KALNI EXPRESS", "UPABAN EXPRESS"]
      }
    ]
  }
};

// গ্লোবাল স্কোপে সংযুক্ত করা যাতে সব স্ক্রিপ্ট সহজে অ্যাক্সেস পায়
if (typeof window !== "undefined") {
  window.RAILWAY_DATA = RAILWAY_DATA;
}
