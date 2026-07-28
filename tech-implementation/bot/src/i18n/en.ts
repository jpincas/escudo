import type { Strings } from "./types.ts";

// Generic international English — not a literal translation of the Spanish, and
// deliberately free of any country's emergency numbers. Those come from
// `alerts.emergency_line` in config.yaml.

export const en: Strings = {
  categories: {
    fuego: "Fire",
    medico: "Medical",
    delito: "Crime",
    emergencia: "Emergency",
    ayuda: "Ask for help",
  },

  board: {
    // The first line is what shows in the pinned bar at the top of the chat,
    // truncated to a few words — so it has to say what to do, not greet.
    title:
      "🛡️ *Escudo Network* — open your alert button below.\n\nAlerts arrive in this group and we organise who goes.\n\nThe button stays on your phone: when you need help, open it and press.",
    hint: "There are your alert buttons. They stay within reach.",
  },

  alert: {
    header: "🚨 {emoji} {category}",
    quietHeader: "{emoji} {category}",
    from: "From: {who} · {time}",
    fromDevice: "{kind} {who} · {time}",
    at: "📍 {address}",
    respond: "Reply in the group if you can go.",
    quietRespond: "Not an emergency. Answer when someone can.",
    cancelled: "Alert cancelled",
    locationCaption: "{who}'s location",
  },

  drill: {
    header: "🧪 DRILL — this is not an emergency",
    from: "Escudo Network test · {village} · {time}",
    body:
      "If your phone made a noise, it is set up correctly. Reply in the group so we know how many of you got it.\n\nNothing else to do. Don't go anywhere.",
  },

  button: {
    falseAlarm: "❌ False alarm",
    shareLocation: "📍 Share my location",
    openBot: "Open button",
  },

  toast: {
    sent: "Alert sent to the group",
    cancelled: "Alert cancelled",
    cancelNotAllowed: "Only the person who raised it, or an admin, can cancel it",
    expired: "This alert is no longer active",
  },

  dm: {
    alertSent:
      "✅ Alert sent to the group. Your neighbours can see it now.\n\nIf you want them to know where you are, press 📍 below.",
    alreadySent: "Your alert is already sent. Your neighbours can see it.",
    helpSent:
      "✅ Your request is in the group, silently. Neighbours will see it next time they look at their phone.\n\nIf this is an emergency, use the buttons above — those make a noise in every house.",
    locationPrompt:
      "Would you like to share your location with the group? One tap and your neighbours will see where you are.",
    locationThanks: "Location sent to the group.",
    buttonsChanged:
      "🔄 The buttons have changed. The new ones are below.\n\nNothing to do — they just need to be there when you need them.",
    welcome:
      "Hello, I'm the Escudo Network bot for {village}.\n\nIf you need help, press one of the buttons below. The alert reaches the village group instantly and your neighbours will see it.\n\nThe buttons stay there. There's nothing to look for.",
  },

  cmd: {
    menuSos: "Show the alert buttons",
    menuStart: "Start again",
    menuPin: "Post and pin the message with the alert buttons",
    menuTest: "Drill: send a test alert to the group",
    menuExport: "Download the incident log",
    menuChatId: "Show this chat's id",
    menuPanel: "Open the admin panel",
    panelCode:
      'Red Escudo admin panel login code:\n<code>{code}</code>\n\nOpen the welcome page, tap "Admin login", and type it in. It expires in 10 minutes and works once. Don\'t share it: whoever enters it signs in as you.',
    testSent: "Drill sent to the group.",
    pinned: "Done. The message with the alert buttons is now pinned.",
    pinFailed:
      "⚠️ I posted the buttons, but couldn't pin the message: I don't have permission.\n\nMake me a group admin with the right to pin messages, then run /pin again. The buttons work meanwhile, but they'll scroll out of reach as people talk.",
    adminOnly: "This command is for group admins only.",
    groupOnly: "This command works in the village group, not here.",
    chatId:
      "This chat's id is:\n<code>{id}</code>\n\nSet it as the ESCUDO_GROUP_CHAT_ID environment variable.",
    exported: "{count} incidents exported.",
  },

  error: {
    generic: "Something went wrong. If this is an emergency, call the emergency services directly.",
  },

  welcome: {
    heading: "The Escudo Network of {village}",
    tagline: "Communities that respond",
    adminLogin: "Admin login",
    escudoNumberLabel: "Escudo number",
    emergencyLineIntro:
      "Escudo supplements the emergency services — it never replaces them. In an emergency, call first:",
    photoAlt: "Photo of the village",
    responsiblePeopleHeading: "Responsible people",
  },

  login: {
    heading: "Admin login",
    instructions:
      "Message /panel to the Escudo bot on Telegram. It will reply with a 9-digit code — type it in below.",
    codeLabel: "Code",
    codeHelp: "The 9-digit code the bot sent you, for example 123 456 789.",
    submit: "Sign in",
    error: "That code is not valid. Ask the bot for another with /panel.",
    backToWelcome: "Back",
  },
};
