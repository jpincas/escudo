// Every piece of UI copy in the panel, in one place. The village-facing
// language is Spanish (the admin using this tool is a volunteer, not a
// developer); keeping every string here — instead of inline in components —
// is what makes a future translation a one-file job instead of a hunt.

import type { DeviceKind, DeviceStatus } from "./api/types.ts";

export const strings = {
  appTitle: "Escudo — Panel",

  signedOut: {
    heading: "Sesión cerrada",
    body: "Para entrar al panel, escribe /panel al bot de Escudo en Telegram. " +
      "Te enviará un enlace nuevo de acceso.",
  },

  loading: "Cargando…",
  genericError: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
  retry: "Reintentar",

  header: {
    // "%s" placeholders — see fmt() below.
    subtitle: "%village% · %name%",
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
    } satisfies Record<DeviceStatus, string>,
    kind: {
      base: "Base",
      pendant: "Colgante",
      watch: "Reloj",
      phone: "Teléfono",
      other: "Otro",
    } satisfies Record<DeviceKind, string>,
    edit: "Editar",
    delete: "Eliminar",
  },

  form: {
    addTitle: "Añadir dispositivo",
    editTitle: "Editar dispositivo",
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
    // "%label%" — see fmt() below.
    heading: "Eliminar dispositivo",
    body: 'Vas a eliminar "%label%". A partir de ese momento, este domicilio ya ' +
      "no podrá dar la alarma con este dispositivo. Esta acción no se puede deshacer.",
    confirm: "Eliminar dispositivo",
    cancel: "Cancelar",
    deleting: "Eliminando…",
  },
} as const;

/**
 * Fills `%name%`-style placeholders in a template string. A tiny stand-in for
 * a real i18n library, matching the constraint that the panel has no
 * dependency beyond react — the bot's own `src/i18n` is unavailable here
 * since it's a separate Deno app.
 */
export function fmt(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`%${key}%`, value),
    template,
  );
}
