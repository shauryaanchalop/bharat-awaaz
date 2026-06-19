export type LangCode = "hi" | "en" | "bn" | "ta" | "te" | "mr" | "gu" | "kn" | "ml" | "pa" | "or";

export const LANGUAGES: { code: LangCode; native: string; english: string }[] = [
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "en", native: "English", english: "English" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "or", native: "ଓଡ଼ିଆ", english: "Odia" },
];

export const UI_STRINGS: Record<LangCode, Record<string, string>> = {
  hi: {
    tagline: "अपनी आवाज़ में, अपनी सरकार से जुड़ें",
    sub: "योजनाएँ खोजें · दस्तावेज़ पढ़ें · फॉर्म भरें · शिकायत दर्ज करें",
    start: "बोलना शुरू करें",
    pick_lang: "अपनी भाषा चुनें",
  },
  en: {
    tagline: "Speak to your government — in your voice",
    sub: "Find schemes · read documents · fill forms · file grievances",
    start: "Start talking",
    pick_lang: "Choose your language",
  },
  bn: { tagline: "নিজের কণ্ঠে সরকারের সাথে কথা বলুন", sub: "প্রকল্প · নথি · ফর্ম · অভিযোগ", start: "কথা বলা শুরু করুন", pick_lang: "আপনার ভাষা বাছাই করুন" },
  ta: { tagline: "உங்கள் குரலில் அரசிடம் பேசுங்கள்", sub: "திட்டங்கள் · ஆவணங்கள் · படிவம் · புகார்", start: "பேச தொடங்குங்கள்", pick_lang: "மொழியை தேர்வுசெய்க" },
  te: { tagline: "మీ గొంతుతో ప్రభుత్వంతో మాట్లాడండి", sub: "పథకాలు · పత్రాలు · దరఖాస్తు · ఫిర్యాదు", start: "మాట్లాడడం ప్రారంభించండి", pick_lang: "మీ భాష ఎంచుకోండి" },
  mr: { tagline: "तुमच्या आवाजात सरकारशी बोला", sub: "योजना · कागदपत्रे · अर्ज · तक्रार", start: "बोलणे सुरू करा", pick_lang: "तुमची भाषा निवडा" },
  gu: { tagline: "તમારા અવાજમાં સરકાર સાથે વાત કરો", sub: "યોજનાઓ · દસ્તાવેજો · ફોર્મ · ફરિયાદ", start: "બોલવાનું શરૂ કરો", pick_lang: "તમારી ભાષા પસંદ કરો" },
  kn: { tagline: "ನಿಮ್ಮ ಧ್ವನಿಯಲ್ಲಿ ಸರ್ಕಾರದೊಂದಿಗೆ ಮಾತನಾಡಿ", sub: "ಯೋಜನೆಗಳು · ದಾಖಲೆಗಳು · ಅರ್ಜಿ · ದೂರು", start: "ಮಾತನಾಡಲು ಪ್ರಾರಂಭಿಸಿ", pick_lang: "ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ" },
  ml: { tagline: "നിങ്ങളുടെ ശബ്ദത്തിൽ സർക്കാരുമായി സംസാരിക്കൂ", sub: "പദ്ധതികൾ · രേഖകൾ · ഫോം · പരാതി", start: "സംസാരം തുടങ്ങുക", pick_lang: "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക" },
  pa: { tagline: "ਆਪਣੀ ਆਵਾਜ਼ ਵਿੱਚ ਸਰਕਾਰ ਨਾਲ ਗੱਲ ਕਰੋ", sub: "ਯੋਜਨਾਵਾਂ · ਦਸਤਾਵੇਜ਼ · ਫਾਰਮ · ਸ਼ਿਕਾਇਤ", start: "ਬੋਲਣਾ ਸ਼ੁਰੂ ਕਰੋ", pick_lang: "ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ" },
  or: { tagline: "ଆପଣଙ୍କ ସ୍ୱରରେ ସରକାରଙ୍କ ସହିତ କଥା ହୁଅନ୍ତୁ", sub: "ଯୋଜନା · କାଗଜପତ୍ର · ଫର୍ମ · ଅଭିଯୋଗ", start: "କଥା ଆରମ୍ଭ କରନ୍ତୁ", pick_lang: "ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ" },
};
