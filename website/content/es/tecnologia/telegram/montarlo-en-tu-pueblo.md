---
translationKey: "tech-telegram-setup"
title: "Montarlo en tu pueblo"
weight: 20
---
# Montarlo en tu pueblo

Nada que comprar y nada que contratar. **Esta capa funciona en un portátil por
cero euros**, y sólo necesita un sitio permanente cuando la comunidad decida
seguir adelante.

## 1. Los nombres

| Elemento | Nombre | Notas |
|---|---|---|
| El grupo | `Red Escudo <Pueblo>` | Por ejemplo *Red Escudo Bercianos*. |
| El bot, nombre visible | `Botón Escudo` | Igual en todos los pueblos. |
| El bot, usuario | `@Escudo<Pueblo>Bot` | Por ejemplo `@EscudoBercianosBot`. |

Un bot tiene dos nombres. El `@usuario` es único en todo Telegram y tiene que
acabar en `bot`, así que cada pueblo registra el suyo. El nombre visible sí puede
repetirse, así que `Botón Escudo` vale para todos: es lo que aparece en la lista
de chats de cada vecino.

## 2. Crear el bot

Hablar con [@BotFather](https://t.me/BotFather):

1. `/newbot` → nombre visible `Botón Escudo` → usuario `@Escudo<Pueblo>Bot`.
2. Guardar el **token**. Es la única contraseña del sistema: quien la tenga puede
   hablar en nombre del bot. Nunca en el grupo ni en ningún documento público.
3. `/setuserpic` → el icono del bot
   ([PNG 512](/img/telegram/bot-icon-512.png)).
4. `/setdescription` → lo que se lee antes de pulsar Empezar:
   > Botón de aviso de la Red Escudo de &lt;Pueblo&gt;. Si necesitas ayuda, pulsa
   > un botón y todo el pueblo lo sabrá al instante.
5. `/setabouttext` → para la ficha del bot:
   > Red Escudo &lt;Pueblo&gt; · Aviso vecinal

**Dejar el modo privacidad activado** (el valor por defecto de BotFather). Así el
bot sólo lee comandos y pulsaciones, nunca las conversaciones del grupo.

## 3. Crear el grupo

1. Un grupo nuevo, `Red Escudo <Pueblo>`.
2. Foto del grupo: el icono de red
   ([PNG 512](/img/telegram/group-icon-512.png)).
3. Añadir el bot.
4. **Hacer administrador al bot**, con permiso para fijar mensajes. No necesita
   ningún otro permiso.

## 4. Configurarlo

Un solo archivo, `config.yaml`, más dos variables de entorno. Adoptar Escudo es
editar el archivo y poner las variables: sin tocar código.

```yaml
village:
  name: "Bercianos del Real Camino"
  locale: es                    # es | en
  timezone: Europe/Madrid       # la hora que se ve en cada aviso

categories:                     # cámbialas si tu pueblo necesita otras
  - { id: fuego,      emoji: "🔥" }
  - { id: medico,     emoji: "🚑" }
  - { id: delito,     emoji: "🚔" }
  - { id: emergencia, emoji: "🆘" }
  - { id: ayuda,      emoji: "🤝", urgency: quiet }   # silenciosa; no es una emergencia

alerts:
  emergency_line: "062 Guardia Civil · 112 Emergencias"
  dedupe_seconds: 60            # pulsaciones repetidas no duplican el aviso

data:
  retention_days: 365           # las incidencias se borran al año
```

Las variables de entorno conectan *tu* despliegue, y nunca se suben al
repositorio: `ESCUDO_BOT_TOKEN` (el token que te dio BotFather — el único
secreto de verdad) y `ESCUDO_GROUP_CHAT_ID` — escribir **`/chatid`** en el
grupo para obtenerlo.

## 5. Anclar el mensaje

Un administrador escribe **`/pin`**. El bot publica el mensaje del grupo con un
botón que abre el *Botón Escudo* de cada vecino, y lo ancla. Ese mensaje hace el
alta: entrar al grupo, tocarlo una vez, y los botones quedan a un chat de
distancia.

## 6. Dar de alta a los vecinos

En la reunión de alta, con el teléfono en la mano —y otra vez por cada vecino
nuevo y cada teléfono nuevo, mientras el pueblo mantenga esto en marcha
([el protocolo]({{< relref "/protocolos/alta-en-telegram" >}})):

1. **Entrar al grupo** `Red Escudo <Pueblo>`.
2. **Abrir Botón Escudo y pulsar Empezar, una vez.** Hasta que lo hagan, la
   conversación está vacía y no tienen botones: pueden seguir *recibiendo*
   avisos por el grupo aunque no puedan *dar* ninguno. Parece que no pasa nada
   raro.
3. **Poner las notificaciones con sonido** para el grupo y para el bot.
4. **Enseñarles los botones. Que nadie pulse ninguno.** Cada pulsación avisa a
   todo el pueblo, así que una sala de veinte personas probando cada una el
   suyo son veinte alarmas.
5. **Al final, mandar un mensaje cualquiera al grupo** y ver quién no lo recibe.
   Un aviso llega como un mensaje de grupo, así que esto comprueba lo mismo sin
   avisar a nadie. Arreglar cualquier teléfono que se quedara callado antes de
   que la gente se vaya.

Los avisos de *prueba* son cosa de los simulacros anunciados y de ningún otro
sitio
([el protocolo]({{< relref "/protocolos/alta-en-telegram" >}})).

## Los comandos

| Comando | Quién | Dónde | Qué hace |
|---|---|---|---|
| `/sos` | cualquiera | grupo o bot | En el bot, recupera los botones |
| `/start` | cualquiera | bot | Da de alta y trae los botones |
| `/pin` | administradores | grupo | Publica y ancla el mensaje del grupo |
| `/test` | administradores | cualquier chat | Publica un simulacro en el grupo — el único aviso de prueba que existe |
| `/export` | administradores | cualquier chat | Descarga el registro de incidencias |
| `/chatid` | cualquiera | cualquier chat | Muestra el identificador del chat |

**Que sea solo para administradores lo impone el bot, no Telegram.** Telegram
no tiene el concepto de comando privilegiado: cualquiera puede escribir
`/export` y llega al bot, que comprueba su condición en el grupo del pueblo y lo
rechaza. Lo que Telegram sí ofrece es el menú por perfil: los cuatro comandos de
administrador sólo aparecen en el menú ☰ para los administradores del grupo, lo
cual es visibilidad, no seguridad.

`/test` es el simulacro, y es a propósito la única forma de hacer sonar todos
los teléfonos del pueblo sin que haya una emergencia. Publica un mensaje que
dice lo que es en la primera línea, y **no crea ninguna incidencia**: los
números que produce un simulacro los cuenta la gente del grupo
([el protocolo]({{< relref "/protocolos/simulacros-y-falsas-alarmas" >}})).

## Detalles que dan problemas

**El bot tiene que ser administrador para anclar.** Si no lo es, publica el
mensaje, avisa de que no ha podido anclarlo y espera a que le des permisos y
repitas `/pin`.

**Si borras el historial del chat con el bot, desaparecen los botones.** Vuelven
de tres maneras: el botón *Empezar* de Telegram, el menú ☰, o escribiendo
cualquier cosa al bot.

**Un teclado se queda en el teléfono del vecino hasta que el bot lo cambia.**
Así que un despliegue que cambia los botones no llega solo a nadie: se
quedarían con el juego antiguo durante meses, y la etiqueta de un botón
retirado ya no corresponde a ninguna categoría, así que pulsarlo no daría
*ningún* aviso. El bot lo resuelve por su cuenta: al arrancar calcula una huella
del teclado, y si el diseño ha cambiado le manda en silencio el nuevo a cada
miembro. Los reinicios y arranques en frío cuestan una lectura de la base de
datos y no mandan nada. A quien no puede alcanzar —alguien que ha bloqueado al
bot— lo reporta en el chat de administración (`ESCUDO_ADMIN_CHAT_ID`), y las
etiquetas de botones retirados se quedan mapeadas a su categoría como red de
seguridad.

**El identificador del grupo cambia si Telegram lo convierte en supergrupo.**
Ocurre solo, al poner un enlace público o al pasar cierto número de miembros. Los
grupos normales son como `-5301262830`; los supergrupos empiezan por `-100`. Hay
que actualizar `ESCUDO_GROUP_CHAT_ID`.

**Pulsar dos veces no manda dos avisos.** Las pulsaciones repetidas de la misma
persona y categoría dentro de `dedupe_seconds` se agrupan en el aviso vivo.

**Cancelar un aviso libera el botón inmediatamente**, así que una emergencia real
justo después de una falsa alarma sale sin esperar.

## Dónde vive el sistema

Un programa pequeño que tiene que estar encendido.

- **Para probarlo:** un portátil. Sin dominio, sin certificados y sin abrir
  puertos.
- **Para usarlo de verdad:** cualquier máquina encendida —un servidor pequeño, un
  Raspberry Pi— o un alojamiento gratuito como
  [Deno Deploy](https://deno.com/deploy).

En Deno Deploy hacen falta tres cosas además de subir el código, y sin ellas
falla:

1. **Una base de datos KV, creada y asignada a la aplicación.** No es automático,
   y el plan gratuito permite una por organización.
2. **El token del bot como variable de entorno** en la aplicación. Allí no se
   leen los archivos `.env` locales.
3. **El webhook apuntando a la URL desplegada**, una vez: `deno task set-webhook
   https://<tu-app>.deno.net`. El sondeo y el webhook son excluyentes, así que
   hay que quitarlo antes de volver a ejecutarlo en local.

Esta capa cuesta cero. El único gasto del pueblo en todo el sistema es el
[número Escudo]({{< relref "/tecnologia/dispositivos" >}}) —alrededor de un euro
al mes— y ni siquiera hace falta hasta que una casa quiera un aparato.

## Datos y responsabilidad

- Guarda **lo mínimo**: nombre, identificador de Telegram y registro de
  incidencias. **Nada de salud ni de vulnerabilidad.**
- Las incidencias **se borran solas** al cumplir `retention_days` (un año por
  defecto).
- `/export` entrega el registro completo: responder a quien pida sus datos lleva
  un minuto.
- **Telegram es responsable por su cuenta** de los mensajes que pasan por su
  plataforma. Hay que decirlo en la nota de privacidad, junto con quién aloja el
  sistema.

## El código

Con licencia MIT, hecho para copiarlo tal cual:
[github.com/jpincas/escudo](https://github.com/jpincas/escudo), en
`tech-implementation/bot`, con su propia guía de instalación y despliegue.
