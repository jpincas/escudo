---
translationKey: "tech-devices-setup"
title: "Montarlo en tu pueblo"
weight: 30
---
# Montarlo en tu pueblo

El manual de la segunda capa de aviso. Da por hecho que
[la capa de Telegram]({{< relref "/tecnologia/telegram/montarlo-en-tu-pueblo" >}})
ya está funcionando, porque ésta publica en el mismo grupo a través del mismo
servidor.

**Un número para todo el pueblo**, no uno por casa. Todos los aparatos y todos
los teléfonos dados de alta guardan el mismo número.

## 1. Lo que hace falta antes

| | Por qué |
|---|---|
| El servidor Escudo, desplegado y accesible en una dirección `https://` fija | Twilio tiene que mandarle peticiones, y tiene que ser *la misma* dirección siempre |
| Una cuenta de Twilio | O de otro proveedor que mande las llamadas y los mensajes entrantes a una URL |
| Un identificador fiscal español: CIF de una asociación, o NIF de una persona | Hace falta para tener un número +34. No es una norma de Twilio: es la política de numeración de la CNMC, así que lo pide cualquier proveedor |
| Un justificante de domicilio en el pueblo | Factura de suministro, notificación de Hacienda, recibo de alquiler, escritura. Merece la pena probar con un **certificado de empadronamiento** si la factura no está a tu nombre. Sin apartados de correos |

El papeleo es lo lento: cuenta con una revisión de documentos, no con una compra
inmediata. Lo demás no lleva más de diez minutos.

## 2. Comprar el número

Un número **móvil**, no geográfico. Los números geográficos españoles muchas
veces no pueden recibir SMS, y esta capa necesita los dos canales.

Comprueba antes de comprarlo que el número tiene activadas **voz *y* SMS**. Un
número sólo de voz sigue valiendo —la llamada perdida es el disparador
principal— pero pierdes el punto en el mapa y el aviso de batería baja.

## 3. Apuntar los dos webhooks a tu servidor

En la consola de Twilio, sobre el número:

| Ajuste | Valor | Método |
|---|---|---|
| **A call comes in** | `https://<tu-app>/bridge/voice` | HTTP POST |
| **A message comes in** | `https://<tu-app>/bridge/sms` | HTTP POST |

## 4. Poner dos variables de entorno

```bash
# Con lo que Twilio firma sus webhooks. Está en la consola de Twilio.
ESCUDO_TWILIO_AUTH_TOKEN="…"

# Dónde se llega a este servidor, exactamente como se ha escrito arriba en Twilio.
ESCUDO_PUBLIC_URL="https://<tu-app>"
```

**Sin el token, las dos rutas ni siquiera se montan.** Es a propósito: no hay
modo sin autenticar, porque un puente abierto es un número de teléfono con el
que cualquiera que lo encuentre puede levantar al pueblo a las tres de la
mañana. La capa de Telegram sigue funcionando igual.

**Las URL tienen que coincidir carácter por carácter.** Twilio calcula la firma
sobre la URL tal como está configurada, así que una barra final de más, o un
`www.` en un lado y no en el otro, hace que todas las llamadas buenas fallen la
comprobación y no den ningún aviso. Ésta es, con diferencia, la forma más común
de acabar con un puente que parece configurado y no hace nada.

## 5. Meter el número en el aparato

Comprara la familia lo que comprara, el montaje tiene la misma forma:

1. **El número Escudo va el primero** en la lista de números del aparato.
2. **Dos o tres vecinos después**, la familia al final. El aparato los llama por
   orden después de mandarle el SMS a Escudo, y quien lo coja habla con la
   persona por el altavoz manos libres. Esa llamada es el acuse de recibo.
3. **Una SIM española de prepago**, con saldo. Apunta de quién es y de cuándo: el
   prepago español muere a los cuatro o nueve meses sin recarga, en silencio.

La mayoría de los equipos se programan mandándoles mensajes con órdenes de
configuración, que vienen en la caja, normalmente mal traducidas. Algunos tienen
aplicación. Cualquiera de las dos vale.

## 6. Dar de alta la casa

**Nadie escribe un número de teléfono en ningún sitio.** El aparato llama al
número Escudo, la llamada aparece en el panel del coordinador como número sin
registrar, y el coordinador le pone nombre y dirección:

| Campo | Ejemplo | Por qué |
|---|---|---|
| **Nombre** | `Casa de María` | Es como se encabeza el aviso en el grupo |
| **Dirección** | `Calle Real 14, la puerta de atrás` | Es la carga útil: un aparato de pared no tiene GPS, así que es adonde acuden los vecinos |
| **Tipo** | base · colgante · reloj · teléfono | Sólo para el coordinador, para que sepa qué está probando. Nada en la vía de aviso depende de esto |

No puede equivocarse en un dígito, porque el número lo ha traído el propio
aparato. A propósito **no hay ninguna casilla para por qué alguien tiene un
aparato**: apuntar eso lo convertiría en un dato de salud, y todo el sistema está
diseñado para no guardar ninguno.

## 7. Probarlo, y seguir probándolo

Púlsalo una vez de verdad, en la casa, con la familia delante. Que oigan
responder a la voz de un vecino. Ése es el momento en que aprenden que la cosa no
cuesta nada usarla.

A partir de ahí es la
[rutina de pruebas]({{< relref "/protocolos/alta-de-telefonos-y-dispositivos" >}}#la-rutina-de-pruebas),
y no es opcional: un aparato de tienda no manda señal de vida ni nivel de
batería, así que una prueba programada es la *única* evidencia de que sigue
funcionando. El bot lleva esa rutina, marca la casa como comprobada con cada
aviso real y cada prueba, y la señala a los sesenta días sin ninguna de las dos.

## Lo que cuesta

| | |
|---|---|
| El número | ~1 $ al mes |
| Un SMS entrante | ~0,0075 $ |
| Una llamada de alarma | **nada** — se rechaza antes de establecerse |
| El servidor | Plan gratuito de Deno Deploy |

Alrededor de un euro al mes para el pueblo, y nada por alarma. Los aparatos
[los compran las familias]({{< relref "elegirlo-con-la-persona" >}}).

## Detalles que dan problemas

**Un número sin dar de alta no avisa al grupo.** Va al coordinador y a la bandeja
de entrada del panel. Es lo correcto —si no, cualquiera que acertase el número
podría alarmar al pueblo— pero significa que un aparato instalado y sin dar de
alta *parece* montado y no hace nada. Para eso existe la bandeja de entrada.

**Un mensaje de batería baja no levanta al pueblo.** Varios aparatos mandan uno,
y con la regla normal eso sería una sirena a las tres de la mañana. Ésos van al
coordinador. Cualquier cosa que el servidor no reconozca sigue dando la alarma.

**Una llamada y un mensaje del mismo aparato son un aviso, no dos.** Llegan con
uno o dos segundos de diferencia; el servidor une el segundo al primero y usa el
texto sólo para añadir el punto en el mapa.

**Llamar al número desde tu propio móvil no hará nada** salvo que tu móvil esté
dado de alta. Prueba desde el aparato, no desde el móvil del coordinador.

**Comprueba que desde la SIM del aparato se puede marcar el número.** Algunas SIM
de teleasistencia que se venden con suscripción están limitadas a una lista de
números permitidos.

## El código

Con licencia MIT:
[github.com/jpincas/escudo](https://github.com/jpincas/escudo), en
`tech-implementation/bot`. El puente es `src/bridge/twilio.ts` — unas doscientas
líneas, con la comprobación de la firma, la búsqueda del número dado de alta y la
única excepción de batería baja, todo en un archivo.
