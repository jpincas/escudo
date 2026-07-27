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
| El servidor Escudo, desplegado y accesible en una dirección `https://` fija | El proveedor tiene que mandarle peticiones, y tiene que estar en marcha *antes* de configurar el webhook |
| Una cuenta de [Zadarma](https://zadarma.com) | O de otro proveedor que mande las llamadas entrantes a una URL. Bercianos usa Zadarma: la centralita en la nube es gratis y las llamadas entrantes también |
| Un identificador fiscal español: CIF de una asociación, o NIF de una persona | Hace falta para tener un número +34. No es una norma del proveedor: es la política de numeración de la CNMC, así que lo pide cualquiera |
| Un justificante de domicilio en el pueblo | Factura de suministro, notificación de Hacienda, recibo de alquiler, escritura. Merece la pena probar con un **certificado de empadronamiento** si la factura no está a tu nombre. Sin apartados de correos |

El papeleo es lo lento: cuenta con una revisión de documentos, no con una compra
inmediata. Lo demás no lleva más de diez minutos.

## 2. Comprar el número

Un número **geográfico** de tu propia provincia — el de Bercianos es de León. No
pagues de más por un número móvil esperando que reciba SMS: ningún número +34, de
ningún tipo, puede recibir un mensaje de un aparato de éstos, porque en España
los mensajes A2P entrantes van por números cortos que tardan meses en darse de
alta y tienen precio de empresa. Esta capa es de voz y nada más.

Después, **activa la centralita en la nube (gratis) y enruta el número a ella.**
Esto importa más de lo que parece: la centralita es la parte que avisa a tu
servidor. Un número apuntado directamente a una línea SIP o a un desvío suena
perfectamente y no le cuenta nada al pueblo.

## 3. Apuntar el webhook a tu servidor

Despliega el servidor primero. Al guardar la URL, Zadarma la llama en el acto con
un saludo de una sola vez, y no acepta una URL que no conteste.

| Ajuste | Valor |
|---|---|
| URL de notificaciones | `https://<tu-app>/bridge/voice` |
| Tipos de notificación | **`notify_start`** — el único que importa |

Los dos están en los ajustes de integraciones de la cuenta, o por API
(`/v1/pbx/callinfo/url/` y `/v1/pbx/callinfo/notifications/`).

`notify_start` salta al *dar tono*, y ésa es toda la razón de que esta capa se
apoye en él. Espera al evento de descolgar y pierdes a todo el que cuelgue a los
dos tonos.

## 4. Poner las variables de entorno

```bash
# El secreto de la cuenta de Zadarma, en Ajustes → API. Es lo que firma el webhook.
ESCUDO_ZADARMA_API_SECRET="…"

# Opcional: un audio subido al menú de voz de la centralita, que se le pone a
# quien llama. Su id es una cadena hexadecimal, no un número. Si se deja sin
# poner, suena la locución propia de la centralita.
ESCUDO_ZADARMA_IVR_PLAY_ID="a6842305f1996e34"
```

**Sin el secreto, el puente ni siquiera se monta.** Es a propósito: no hay modo
sin autenticar, porque un puente abierto es un número de teléfono con el que
cualquiera que lo encuentre puede levantar al pueblo a las tres de la mañana. La
capa de Telegram sigue funcionando igual.

## 5. Meter el número en el aparato

Comprara la familia lo que comprara, el montaje tiene la misma forma:

1. **El número Escudo va el primero** en la lista de números del aparato.
2. **Dos o tres vecinos después**, la familia al final. El aparato los llama por
   orden después del número Escudo, y quien lo coja habla con la persona por el
   altavoz manos libres. Esa llamada es el acuse de recibo.
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

Púlsalo una vez de verdad, en la casa, con la familia delante. Que oigan la
locución y después la voz de un vecino. Ése es el momento en que aprenden que
nadie se va a enfadar con ellos por usarla.

A partir de ahí es la
[rutina de pruebas]({{< relref "/protocolos/alta-de-telefonos-y-dispositivos" >}}#la-rutina-de-pruebas),
y no es opcional: un aparato de tienda no manda señal de vida ni nivel de
batería, así que una prueba programada es la *única* evidencia de que sigue
funcionando. El bot lleva esa rutina, marca la casa como comprobada con cada
aviso real y cada prueba, y la señala a los sesenta días sin ninguna de las dos.

## Lo que cuesta

| | |
|---|---|
| El número | 1,70 € al mes, facturados por años |
| La centralita en la nube, y diez líneas simultáneas | gratis |
| Una llamada de alarma, para el pueblo | **nada** |
| Una llamada de alarma, para quien llama | gratis en cualquier contrato con llamadas a fijo incluidas; unos céntimos en prepago, una vez que se coge la locución |
| El servidor | Plan gratuito de Deno Deploy |

Unos 20 € al año para el pueblo, y nada por alarma. Los aparatos
[los compran las familias]({{< relref "elegirlo-con-la-persona" >}}).

## Detalles que dan problemas

**Un grupo callado casi siempre es un número sin dar de alta.** Antes de
sospechar del webhook, mira la bandeja de entrada del panel: ahí es donde cae,
por diseño, quien llama sin estar registrado.

**Varias llamadas del mismo aparato son un aviso, no varios.** Un colgante que
marca su lista por orden, o alguien asustado que vuelve a llamar, dan una sola
incidencia y no una ráfaga.

**Llamar al número desde tu propio móvil no avisará a nadie** salvo que tu móvil
esté dado de alta. Prueba desde el aparato, o da de alta antes el móvil del
coordinador.

**Comprueba que desde la SIM del aparato se puede marcar el número.** Algunas SIM
de teleasistencia que se venden con suscripción están limitadas a una lista de
números permitidos.

**Todo lo anterior depende de dos ajustes que no se pueden probar desde el
servidor:** que el número esté enrutado a la centralita, y que `notify_start`
esté activado. Sin ellos, un puente que pasa todas las demás comprobaciones se
queda callado igual.

## El código

Con licencia MIT:
[github.com/jpincas/escudo](https://github.com/jpincas/escudo), en
`tech-implementation/bot`. El puente es `src/bridge/zadarma.ts` — unas
doscientas líneas, con la comprobación de la firma y la respuesta; la búsqueda
del número dado de alta y la única excepción de batería baja las comparte con
cualquier otro proveedor en `src/bridge/inbound.ts`. `DEPLOY.md` recoge las
trampas, incluida la codificación de la firma, que no es la que da a entender la
documentación del propio proveedor.
