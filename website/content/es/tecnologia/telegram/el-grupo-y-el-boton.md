---
translationKey: "tech-telegram"
title: "El grupo y el botón"
weight: 10
---
# El grupo y el botón

Dos elementos de Telegram, dos funciones:

<div class="escudo-avatars">
  <figure>
    <img src="/img/telegram/group-icon-512.png" alt="Icono del grupo: escudo ámbar rodeado de nodos enlazados.">
    <figcaption><b>Red Escudo &lt;Pueblo&gt;</b><span>El grupo. Llegan los avisos, los vecinos se organizan.</span></figcaption>
  </figure>
  <figure>
    <img src="/img/telegram/bot-icon-512.png" alt="Icono del bot: SOS sobre un botón rojo.">
    <figcaption><b>Botón Escudo</b><span>El bot. Un toque y suena la alarma.</span></figcaption>
  </figure>
</div>

**El bot es la versión virtual del pulsador de pánico** — no es un asistente ni
un chat con el que conversar. Vive en el teléfono, siempre en el mismo sitio, y
al pulsarlo avisa al pueblo.

## Por qué están separados

Las dos limitaciones son de Telegram:

- **Un grupo no puede tener botones fijos en pantalla.** Lo más parecido es un
  mensaje anclado: en el móvil, una franja fina arriba que hay que tocar, saltar
  y luego pulsar.
- **Un grupo no puede pedir la ubicación.** El botón de «compartir ubicación»
  sólo funciona en conversaciones privadas; en un grupo la petición falla.

Una conversación privada no tiene ninguna de las dos. Los botones se quedan fijos
sobre el teclado y la ubicación es un toque. **Se avisa en el bot, se responde en
el grupo.**

## Lo que ve un vecino

Seis botones que no se van nunca, en dos niveles:

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/bot-teclado.png" alt="Los botones fijos: Fuego, Médico, Delito y Emergencia, luego Compartir mi ubicación, y por su cuenta, Pedir ayuda.">
  <span class="caption">Fijos sobre el teclado. Abrir y pulsar.</span>
</div>

Las cuatro categorías de alarma salen de la configuración del pueblo: se
renombran, se quitan o se añaden otras. Debajo del botón de ubicación está
**🤝 Pedir ayuda**, que es [otra cosa](#el-nivel-silencioso).

Telegram no permite ningún estilo en estos botones: ni color, ni tamaño, ni
grosor. Filas, emoji y mayúsculas son todo el repertorio disponible, y por eso
el botón silencioso se coloca debajo del de ubicación en vez de teñirlo de otro
color.

Un toque manda el aviso. El bot confirma en la misma conversación:

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/bot-confirmacion.png" alt="El bot confirma que el aviso se ha enviado y ofrece compartir la ubicación.">
  <span class="caption">La ubicación es opcional y está en el mismo teclado.</span>
</div>

## Lo que ve el pueblo

Quién lo ha dado, a qué hora —la del pueblo— y los teléfonos de emergencia:

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/grupo-alerta.png" alt="Aviso de fuego en el grupo, con botón de falsa alarma y la ubicación en el mapa.">
  <span class="caption">Si se comparte la ubicación, el mapa se engancha debajo.</span>
</div>

```
🚨 🔥 FUEGO
De: María G. · 16:32

Responde en el grupo si puedes acudir.
062 Guardia Civil · 112 Emergencias
```

Los teléfonos aparecen en todos los avisos. Escudo complementa al 062 y al 112;
nunca los sustituye.

## El nivel silencioso

**🤝 Pedir ayuda** llega al mismo grupo y a la misma gente, y no suena en
ningún sitio. Es para una puerta que no abre, una escalera prestada, que te
acerquen a Sahagún —necesidades reales que no son una emergencia.

```
🤝 Pedir ayuda
De: María G. · 16:32

No es una emergencia. Responde cuando alguien pueda.
```

Sin 🚨, sin gritar, sin números de emergencia y sin botón de falsa alarma —no
hay alarma que cancelar. Técnicamente es un indicador más en la configuración y
`disable_notification` al enviarlo:

```yaml
- { id: ayuda, emoji: "🤝", urgency: quiet }
```

**Existe para proteger al nivel que sí suena.** La gente silencia los grupos que
hacen ruido, y un grupo silenciado es el mayor fallo que tiene este sistema. Dar
a las escaleras y a los favores un canal silencioso es lo que permite que un
pueblo deje el grupo con sonido todo el año.

## La falsa alarma

Todo aviso lleva un botón **❌ Falsa alarma**, que puede pulsar quien dio el aviso
o cualquier administrador del grupo. El mensaje se queda tachado, con una línea
sobria debajo: el registro se conserva y no se regaña a nadie. Una falsa alarma
tiene que salir barata
([Protocolo Escudo]({{< relref "/protocolos/simulacros-y-falsas-alarmas" >}})).

## El simulacro

`/test`, escrito por un administrador, publica el único mensaje del sistema que
hace sonar todos los teléfonos sin que haya una emergencia:

```
🧪 SIMULACRO — no es una emergencia
Prueba de la Red Escudo de Bercianos del Real Camino · 16:32

Si te ha sonado el móvil, lo tienes bien configurado. Responde en el grupo
para que sepamos a cuántos os ha llegado.

No hay que hacer nada más. No acudas a ningún sitio.
```

Suena a propósito —lo único que comprueba un simulacro es si los teléfonos
hacen ruido— y dice lo que es en la primera línea, para que nadie salga
corriendo. **No genera ninguna incidencia**: un simulacro en el registro
falsearía justo los números que el simulacro existe para producir.

Los miembros no lanzan pruebas por su cuenta. Que cada uno pulsara la suya sería
una alarma por persona
([el protocolo]({{< relref "/protocolos/simulacros-y-falsas-alarmas" >}})).

## La ubicación

📍 está en el mismo teclado que los botones de aviso: un toque más, misma
conversación. El mapa aparece enganchado al aviso en el grupo.

Es opcional. En un pueblo de doscientas personas el nombre ya suele decir la
casa; la ubicación importa cuando alguien está en el campo o en un camino.

**Telegram nunca da la ubicación sin que la persona la comparta.** Un bot no
puede consultarla.

## Los dos, juntos

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/lista-chats.png" alt="El grupo Red Escudo Bercianos y el Botón Escudo, uno junto al otro en la lista de chats.">
  <span class="caption">El grupo y el botón, en la lista de chats a tamaño real.</span>
</div>

## Lo que esta capa no resuelve

- **Los teléfonos silenciados, con diferencia el mayor riesgo.** Un aviso sólo
  sirve si suena en casa de alguien. La
  [Red Escudo]({{< relref "/como-funciona/la-red-escudo" >}}) hace que
  configurar las notificaciones sea parte del alta, y lo comprueba dos veces al
  año con un
  [simulacro]({{< relref "/protocolos/simulacros-y-falsas-alarmas" >}}).
- **Sin internet no hay aviso.** El respaldo es la cadena de teléfonos de
  siempre.
- **Hay que tener teléfono y saber abrirlo.** Del resto se ocupan los
  [teléfonos y aparatos]({{< relref "/tecnologia/dispositivos" >}}): un colgante,
  una base de pared, o un móvil de teclas que sólo tiene que hacer una llamada.

## Qué se guarda

Nombre e identificador de Telegram, y un registro de incidencias: categoría,
hora, quién, ubicación si se compartió y si se canceló. Las incidencias se borran
solas al año, y cualquiera puede pedir ver sus datos o que se eliminen.

**No se guarda ninguna etiqueta de salud ni de vulnerabilidad.** Anotar quién es
frágil convertiría esto en datos especialmente protegidos del RGPD. Una lista de
vecinos no es un registro de personas vulnerables.
