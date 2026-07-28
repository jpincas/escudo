import type { Strings } from "./types.ts";

// The shipped, village-read wording — carried over verbatim from the old
// src/strings.ts rather than re-translated, since this is the copy Bercianos
// actually reads today. Only the placeholder syntax changed (%name% -> {name}).
export const es: Strings = {
  appTitle: "Escudo — Panel",

  signedOut: {
    heading: "Sesión cerrada",
    body: "Para entrar al panel, escribe /panel al bot de Escudo en Telegram. " +
      "Te enviará un código de 9 dígitos: escríbelo en la página de acceso.",
    loginLink: "Ir a la página de acceso",
  },

  loading: "Cargando…",
  genericError: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
  retry: "Reintentar",

  sidebar: {
    navLabel: "Secciones del panel",
    devices: "Dispositivos",
    inbox: "Bandeja de entrada",
    history: "Historial",
    config: "Configuración",
    signOut: "Cerrar sesión",
  },

  devices: {
    heading: "Dispositivos",
    add: "Añadir dispositivo",
    empty: {
      heading: "No hay dispositivos registrados",
      body: "Todavía no se ha dado de alta ningún dispositivo. Sin al menos uno, " +
        'nadie en este domicilio puede dar la alarma. Usa "Añadir dispositivo" ' +
        "para registrar el primero.",
    },
    columns: {
      label: "Etiqueta",
      address: "Domicilio",
      msisdn: "Teléfono",
      kind: "Tipo",
      status: "Estado",
      lastProvenAt: "Última prueba",
      actions: "Acciones",
    },
    status: {
      ok: "Correcto",
      overdue: "Caducado",
      never: "Nunca probado",
    },
    kind: {
      base: "Base con colgante",
      wearable: "Colgante o reloj",
      phone: "Teléfono",
      alarm: "Alarma de vivienda",
      other: "Otro",
    },
    edit: "Editar",
    delete: "Eliminar",
  },

  form: {
    addTitle: "Añadir dispositivo",
    editTitle: "Editar dispositivo",
    registerTitle: "Registrar dispositivo",
    msisdn: "Teléfono",
    msisdnHelp: "Formato internacional, por ejemplo +34600111222. No se puede cambiar después.",
    label: "Etiqueta",
    labelHelp: 'Por ejemplo, "Casa de María".',
    address: "Domicilio",
    addressHelp: 'Por ejemplo, "Calle Real 14".',
    kind: "Tipo",
    save: "Guardar",
    cancel: "Cancelar",
    saving: "Guardando…",
  },

  deleteConfirm: {
    heading: "Eliminar dispositivo",
    body: 'Vas a eliminar "{label}". A partir de ese momento, este domicilio ya ' +
      "no podrá dar la alarma con este dispositivo. Esta acción no se puede deshacer.",
    confirm: "Eliminar dispositivo",
    cancel: "Cancelar",
    deleting: "Eliminando…",
  },

  testAlert: {
    action: "Probar",
    heading: "Lanzar una alerta de prueba",
    intro: 'Así se vería la alerta de "{label}" en el grupo:',
    loading: "Preparando la vista previa…",
    warning: "El grupo recibirá esta alerta como una alerta real. Los vecinos " +
      "no sabrán que es una prueba, y pueden ponerse en camino. Avisa antes.",
    category: "Categoría",
    confirm: "Enviar al grupo",
    sending: "Enviando…",
    cancel: "Cancelar",
    sent: "Alerta enviada. Cancélala en el grupo cuando termines.",
    duplicate: "Ya había una alerta abierta de este dispositivo, así que no se " +
      "ha enviado otra.",
  },

  config: {
    heading: "Configuración",
    intro: "Esta información aparece en la página pública de bienvenida del pueblo.",
    phoneLabel: "Teléfono de Escudo",
    phoneHelp: "El número que un vecino llama para dar la alarma. Formato " +
      "internacional, por ejemplo +34600111222. Déjalo en blanco si este " +
      "pueblo todavía no tiene puente de llamadas.",
    photoLabel: "Foto (URL)",
    photoHelp: "Enlace a una imagen alojada en otro sitio. Debe empezar por " +
      "https://. No se puede subir un archivo.",
    introTextLabel: "Texto de presentación",
    introTextHelp: "Un párrafo breve presentando la Red Escudo de este pueblo.",
    peopleHeading: "Personas responsables",
    peopleNotice: "Estos nombres se publican en la página pública del pueblo, " +
      "indexable por los buscadores: puede verlos cualquiera en internet, no " +
      "solo quien tenga el enlace. Antes de añadir a alguien, dile que su " +
      "nombre y su función aparecerán ahí.",
    peopleEmpty: "Todavía no se ha añadido ninguna persona responsable.",
    nameLabel: "Nombre",
    roleLabel: "Función",
    addPerson: "Añadir persona",
    removePerson: "Eliminar",
    moveUp: "Subir",
    moveDown: "Bajar",
    save: "Guardar",
    saving: "Guardando…",
    saved: "Guardado.",
  },

  inbox: {
    heading: "Bandeja de entrada",
    intro: "Los números que llaman o escriben a Escudo sin estar registrados " +
      "aparecen aquí, listos para darlos de alta o descartarlos. Se eliminan " +
      "automáticamente a los {days} días.",
    empty: {
      heading: "No hay números pendientes",
      body: "Cuando alguien llame o escriba al puente de Escudo desde un " +
        "número que todavía no está registrado como dispositivo, aparecerá " +
        "aquí para poder darlo de alta o descartarlo. Es también la única " +
        "señal de que un dispositivo se instaló y no se terminó de configurar.",
    },
    columns: {
      msisdn: "Teléfono",
      count: "Veces",
      firstSeen: "Primera vez",
      lastSeen: "Última vez",
      channel: "Vía",
      lastBody: "Último mensaje",
      actions: "Acciones",
    },
    channel: {
      call: "Llamada",
      sms: "SMS",
    },
    register: "Registrar",
    dismiss: "Descartar",
  },

  dismissConfirm: {
    heading: "Descartar número",
    body: 'Vas a descartar "{msisdn}" de la bandeja de entrada. No se creará ' +
      "ningún dispositivo, y si el número vuelve a llamar, aparecerá aquí de nuevo.",
    confirm: "Descartar",
    cancel: "Cancelar",
    dismissing: "Descartando…",
  },

  history: {
    heading: "Historial",
    intro: "Este historial cubre los últimos {days} días. No es un archivo " +
      "permanente: lo que supera ese plazo se elimina automáticamente, por " +
      "diseño y por ley.",
    empty: {
      heading: "No hay incidencias registradas",
      body: "Cuando se produzca una alerta —desde Telegram o desde un " +
        "dispositivo— aparecerá aquí.",
    },
    columns: {
      when: "Cuándo",
      category: "Categoría",
      source: "Origen",
      who: "Quién / dónde",
      location: "Ubicación",
      drill: "Simulacro",
      cancelled: "Cancelada",
    },
    source: {
      telegram: "Telegram",
      device: "Dispositivo",
    },
    locationLink: "Ver ubicación",
    drillBy: "Simulacro — {name}",
    cancelledAt: "Cancelada · {when}",
    pagination: {
      prev: "Anterior",
      next: "Siguiente",
    },
  },
};
