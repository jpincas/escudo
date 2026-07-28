import type { Strings } from "./types.ts";

export const es: Strings = {
  categories: {
    fuego: "Fuego",
    medico: "Médico",
    delito: "Delito",
    emergencia: "Emergencia",
    ayuda: "Pedir ayuda",
  },

  board: {
    // The first line is what shows in the pinned bar at the top of the chat,
    // truncated to a few words — so it has to say what to do, not greet.
    title:
      "🛡️ *Red Escudo* — abre tu botón de aviso aquí abajo.\n\nEn este grupo llegan los avisos y nos organizamos para acudir.\n\nEl botón se queda guardado en tu teléfono: cuando necesites ayuda, lo abres y pulsas.",
    hint: "Ahí tienes los botones de aviso. Se quedan siempre a mano.",
  },

  alert: {
    header: "🚨 {emoji} {category}",
    quietHeader: "{emoji} {category}",
    from: "De: {who} · {time}",
    fromDevice: "{kind} {who} · {time}",
    at: "📍 {address}",
    respond: "Responde en el grupo si puedes acudir.",
    quietRespond: "No es una emergencia. Responde cuando alguien pueda.",
    cancelled: "Alerta cancelada",
    locationCaption: "Ubicación de {who}",
  },

  drill: {
    header: "🧪 SIMULACRO — no es una emergencia",
    from: "Prueba de la Red Escudo de {village} · {time}",
    body:
      "Si te ha sonado el móvil, lo tienes bien configurado. Responde en el grupo para que sepamos a cuántos os ha llegado.\n\nNo hay que hacer nada más. No acudas a ningún sitio.",
  },

  button: {
    falseAlarm: "❌ Falsa alarma",
    shareLocation: "📍 Compartir mi ubicación",
    openBot: "Abrir botón",
  },

  toast: {
    sent: "Aviso enviado al grupo",
    cancelled: "Alerta cancelada",
    cancelNotAllowed: "Solo puede cancelarla quien dio el aviso o un administrador",
    expired: "Este aviso ya no está activo",
  },

  dm: {
    alertSent:
      "✅ Aviso enviado al grupo. Los vecinos ya lo están viendo.\n\nSi quieres que sepan dónde estás, pulsa 📍 aquí abajo.",
    alreadySent: "Tu aviso ya está enviado. Los vecinos lo están viendo.",
    helpSent:
      "✅ Tu petición está en el grupo, sin sonar. Los vecinos la verán cuando miren el móvil.\n\nSi es una emergencia, usa los botones de arriba: esos sí suenan en todas las casas.",
    locationPrompt:
      "¿Quieres compartir tu ubicación con el grupo? Un toque y los vecinos verán dónde estás.",
    locationThanks: "Ubicación enviada al grupo.",
    welcome:
      "Hola, soy el bot de la Red Escudo de {village}.\n\nSi necesitas ayuda, pulsa uno de los botones de aquí abajo. El aviso llega al instante al grupo del pueblo y los vecinos lo verán.\n\nLos botones se quedan siempre ahí. No hace falta buscar nada.",
    buttonsChanged:
      "🔄 Han cambiado los botones. Aquí abajo tienes los nuevos.\n\nNo hay que hacer nada: solo que estén a mano cuando hagan falta.",
  },

  cmd: {
    menuSos: "Mostrar los botones de aviso",
    menuStart: "Empezar de nuevo",
    menuPin: "Publicar y fijar el mensaje con los botones",
    menuTest: "Simulacro: mandar un aviso de prueba al grupo",
    menuExport: "Descargar el registro de incidencias",
    menuChatId: "Ver el identificador de este chat",
    menuPanel: "Abrir el panel de administración",
    panelCode:
      "Código de acceso al panel de administración de la Red Escudo:\n<code>{code}</code>\n\nAbre la página de bienvenida, pulsa «Acceso administración» y escríbelo ahí. Caduca en 10 minutos y solo funciona una vez. No lo compartas: quien lo escriba entra como tú.",
    testSent: "Simulacro enviado al grupo.",
    pinned: "Listo. Ya está fijado el mensaje con los botones de aviso.",
    pinFailed:
      "⚠️ He publicado los botones, pero no he podido fijar el mensaje: me faltan permisos.\n\nHazme administrador del grupo, con permiso para fijar mensajes, y vuelve a escribir /pin. Mientras tanto los botones funcionan, pero se irán perdiendo hacia arriba según se hable en el grupo.",
    adminOnly: "Este comando es solo para administradores del grupo.",
    groupOnly: "Este comando funciona en el grupo del pueblo, no aquí.",
    chatId:
      "El identificador de este chat es:\n<code>{id}</code>\n\nPonlo en la variable de entorno ESCUDO_GROUP_CHAT_ID.",
    exported: "{count} incidencias exportadas.",
  },

  error: {
    generic:
      "Ha habido un problema. Si es una emergencia, llama directamente a los números de emergencia.",
  },

  welcome: {
    heading: "Red Escudo de {village}",
    tagline: "Comunidades que responden",
    adminLogin: "Acceso administración",
    escudoNumberLabel: "Número Escudo",
    emergencyLineIntro:
      "Escudo no sustituye a las autoridades. Ante una emergencia, llama primero a:",
    photoAlt: "Foto del pueblo",
    responsiblePeopleHeading: "Personas responsables",
  },

  login: {
    heading: "Acceso de administración",
    instructions:
      "Escribe /panel al bot de Escudo en Telegram. Te responderá con un código de 9 dígitos: escríbelo aquí abajo.",
    codeLabel: "Código",
    codeHelp: "El código de 9 dígitos que te ha enviado el bot, por ejemplo 123 456 789.",
    submit: "Entrar",
    error: "Ese código no es válido. Pide otro al bot con /panel.",
    backToWelcome: "Volver",
  },
};
